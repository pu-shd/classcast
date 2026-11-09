// UmbraCast page wiring: setup panel, class link, roster rendering.
import {
    DEFAULT_BASE_URL, LIMITS, assignIds, parseCSV, detectNameColumn, namesFromRows,
    shareUrl, viewUrl, renderStudentRows, renderColumnOptions, cleanText,
    normalizeBaseUrl, newSessionId, encodeConfig, decodeConfig, parseHash, buildHash,
} from "./classcast.js";

const $ = (id) => document.getElementById(id);

// Shown until the teacher imports a roster; not written into the link.
const DEMO_STUDENTS = [
    { name: "Alice Chen", id: "alice" },
    { name: "Bob Martinez", id: "bob" },
    { name: "Carol Johnson", id: "carol" },
    { name: "David Kim", id: "david" },
    { name: "Emma Wilson", id: "emma" },
    { name: "Frank Brown", id: "frank" },
    { name: "Grace Lee", id: "grace" },
    { name: "Henry Davis", id: "henry" },
    { name: "Iris Patel", id: "iris" },
    { name: "Jack Thompson", id: "jack" },
    { name: "Katie Moore", id: "katie" },
    { name: "Liam Garcia", id: "liam" },
    { name: "Maya Anderson", id: "maya" },
    { name: "Noah Taylor", id: "noah" },
    { name: "Olivia White", id: "olivia" }
];

const state = {
    session: "",
    baseUrl: DEFAULT_BASE_URL,
    password: "",
    names: null, // roster names, or null for the demo roster
};
let students = DEMO_STUDENTS;
let csvData = null;
let hashWriteSeq = 0;

const roomPrefix = () => `uc_${state.session}_`;
const links = {
    share: (id) => shareUrl(state.baseUrl, roomPrefix() + id, state.password),
    view: (id) => viewUrl(state.baseUrl, roomPrefix() + id, state.password),
};

function setStatus(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = "csv-status" + (kind ? " " + kind : "");
}

function showLinkError(message) {
    const el = $("linkError");
    el.textContent = `${message}. Ask your teacher for a fresh link.`;
    el.hidden = false;
}

function renderStudentList() {
    renderStudentRows($("studentList"), students, links);
}

// Keep the address bar (and the Class link box) in sync with the setup.
async function writeHash() {
    const seq = ++hashWriteSeq;
    const data = state.names || state.password || state.baseUrl !== DEFAULT_BASE_URL
        ? await encodeConfig({
            names: state.names ?? undefined,
            baseUrl: state.baseUrl,
            password: state.password,
        })
        : null;
    if (seq !== hashWriteSeq) return; // a newer change already won
    const hash = buildHash(state.session, data);
    history.replaceState(null, "", "#" + hash);
    $("classLink").value = location.href;
    if (location.href.length > 8000) {
        setStatus("linkStatus", "This link is very long; some apps may cut it off. Consider a gist roster.", "error");
    }
}

function setRoster(names) {
    state.names = names;
    students = assignIds(names);
    renderStudentList();
    writeHash();
}

function onConfigInput() {
    try {
        state.baseUrl = normalizeBaseUrl($("baseUrl").value);
        state.password = cleanText($("roomPassword").value, LIMITS.maxPasswordLength);
        setStatus("configStatus", "");
    } catch (err) {
        setStatus("configStatus", err.message, "error");
        return; // keep the last valid settings
    }
    renderStudentList();
    writeHash();
}

function updateColumnSelector() {
    const select = $("columnSelect");
    const label = $("columnSelectLabel");
    const hasHeader = $("hasHeader").checked;

    if (!csvData || csvData.rows.length === 0) {
        label.classList.remove("visible");
        return;
    }

    const firstRow = csvData.rows[0];
    if (firstRow.length <= 1) {
        label.classList.remove("visible");
        importFromColumn(0);
        return;
    }

    label.classList.add("visible");
    renderColumnOptions(select, firstRow, hasHeader);
    if (hasHeader) {
        const nameIndex = detectNameColumn(firstRow);
        if (nameIndex >= 0) select.value = String(nameIndex);
    }
    importFromColumn(parseInt(select.value, 10));
}

function importFromColumn(colIndex) {
    if (!csvData || csvData.rows.length === 0) return;
    const hasHeader = $("hasHeader").checked;
    const names = namesFromRows(csvData.rows, { hasHeader, column: colIndex })
        .map((n) => cleanText(n, LIMITS.maxNameLength))
        .filter(Boolean);

    if (names.length === 0) {
        setStatus("csvStatus", "No valid names found in selected column", "error");
        return;
    }
    if (names.length > LIMITS.maxStudents) {
        setStatus("csvStatus", `Too many names (${names.length}); the limit is ${LIMITS.maxStudents}`, "error");
        return;
    }
    setRoster(names);
    setStatus("csvStatus", `Imported ${names.length} student${names.length !== 1 ? "s" : ""}. Copy the class link below.`, "success");
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        setStatus("csvStatus", "");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            csvData = parseCSV(e.target.result);
            if (csvData.rows.length === 0) {
                setStatus("csvStatus", "CSV file is empty", "error");
                return;
            }
            updateColumnSelector();
        } catch (err) {
            setStatus("csvStatus", "Error parsing CSV: " + err.message, "error");
        }
    };
    reader.onerror = () => setStatus("csvStatus", "Error reading file", "error");
    reader.readAsText(file);
}

async function copyClassLink() {
    const input = $("classLink");
    try {
        await navigator.clipboard.writeText(input.value);
        $("copyLink").textContent = "Copied";
        setTimeout(() => { $("copyLink").textContent = "Copy"; }, 1500);
    } catch {
        input.select();
        setStatus("linkStatus", "Press Cmd+C / Ctrl+C to copy the selected link.", "");
    }
}

// Load whatever the link carries, then render.
async function init() {
    const { session, data } = parseHash(location.hash);
    state.session = session ?? newSessionId();

    if (data) {
        $("setup").open = false; // students and presenters land on the roster
        try {
            const config = await decodeConfig(data);
            if (config.baseUrl) state.baseUrl = config.baseUrl;
            if (config.password) state.password = config.password;
            if (config.names) {
                state.names = config.names;
                students = assignIds(config.names);
            }
        } catch (err) {
            // Never fall back to the demo roster: wrong links would look right.
            showLinkError(err.message);
            students = [];
            $("setup").open = true;
            renderStudentList();
            return;
        }
    }

    $("baseUrl").value = state.baseUrl;
    $("roomPassword").value = state.password;
    renderStudentList();
    await writeHash();
}

$("baseUrl").addEventListener("input", onConfigInput);
$("roomPassword").addEventListener("input", onConfigInput);
$("csvFile").addEventListener("change", handleFileSelect);
$("hasHeader").addEventListener("change", updateColumnSelector);
$("columnSelect").addEventListener("change", (e) => importFromColumn(parseInt(e.target.value, 10)));
$("copyLink").addEventListener("click", copyClassLink);
// Pasting a different class link into this tab: start over from it.
window.addEventListener("hashchange", () => location.reload());

init();
