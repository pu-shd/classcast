// UmbraCast page wiring: setup panel, class link, roster rendering.
import {
    DEFAULT_BASE_URL, LIMITS, assignIds, parseCSV, detectNameColumn, rosterNamesFromCSV,
    shareUrl, viewUrl, renderStudentRows, renderColumnOptions, cleanText,
    normalizeBaseUrl, newSessionId, encodeConfig, decodeConfig, parseHash, buildHash,
    parseGistRef, gistPageUrl, fetchGistText,
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

const LINK_NOTE_NAMES = "The roster lives in the link itself and is never uploaded. Anyone with the link can see the names and room password.";
const LINK_NOTE_GIST = "The roster is read from your gist each time the page opens; GitHub can take up to 5 minutes to show edits. Anyone with the link can see the names and room password.";

const state = {
    session: "",
    baseUrl: DEFAULT_BASE_URL,
    password: "",
    names: null, // roster carried in the link, or null
    gist: null, // { user, id, file?, hasHeader, column } when the roster comes from a gist
};
let students = DEMO_STUDENTS;
let csvText = null; // CSV being imported, from a file or a gist
let csvGistRef = null; // set when csvText came from a gist
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
    el.textContent = `${message}. Ask your teacher to check the class link.`;
    el.hidden = false;
}

function showLoading(text) {
    const div = document.createElement("div");
    div.className = "loading";
    div.textContent = text;
    $("studentList").replaceChildren(div);
}

function renderStudentList() {
    renderStudentRows($("studentList"), students, links);
}

// Keep the address bar (and the Class link box) in sync with the setup.
async function writeHash() {
    const seq = ++hashWriteSeq;
    const hasData = state.names || state.gist || state.password || state.baseUrl !== DEFAULT_BASE_URL;
    const data = hasData
        ? await encodeConfig({
            names: state.names ?? undefined,
            gist: state.gist ?? undefined,
            baseUrl: state.baseUrl,
            password: state.password,
        })
        : null;
    if (seq !== hashWriteSeq) return; // a newer change already won
    history.replaceState(null, "", "#" + buildHash(state.session, data));
    $("classLink").value = location.href;
    if (location.href.length > 8000) {
        setStatus("linkStatus", "This link is very long; some apps may cut it off. Consider a gist roster.", "error");
    } else {
        setStatus("linkStatus", state.gist ? LINK_NOTE_GIST : LINK_NOTE_NAMES);
    }
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
    const rows = csvText === null ? [] : parseCSV(csvText).rows;

    if (rows.length === 0) {
        label.classList.remove("visible");
        return;
    }
    if (rows[0].length <= 1) {
        label.classList.remove("visible");
        importFromColumn(0);
        return;
    }

    label.classList.add("visible");
    renderColumnOptions(select, rows[0], hasHeader);
    if (hasHeader) {
        const nameIndex = detectNameColumn(rows[0]);
        if (nameIndex >= 0) select.value = String(nameIndex);
    }
    importFromColumn(parseInt(select.value, 10));
}

function importFromColumn(column) {
    if (csvText === null) return;
    const hasHeader = $("hasHeader").checked;
    let names;
    try {
        names = rosterNamesFromCSV(csvText, { hasHeader, column });
    } catch (err) {
        setStatus("csvStatus", err.message, "error");
        return;
    }
    if (csvGistRef) {
        state.gist = { ...csvGistRef, hasHeader, column };
        state.names = null;
    } else {
        state.names = names;
        state.gist = null;
    }
    students = assignIds(names);
    renderStudentList();
    writeHash();
    const from = csvGistRef ? " from the gist" : "";
    setStatus("csvStatus", `Imported ${names.length} student${names.length !== 1 ? "s" : ""}${from}. Copy the class link below.`, "success");
}

function startImport(text, gistRef) {
    if (parseCSV(text).rows.length === 0) {
        setStatus("csvStatus", gistRef ? "The gist is empty" : "CSV file is empty", "error");
        return;
    }
    csvText = text;
    csvGistRef = gistRef;
    updateColumnSelector();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        setStatus("csvStatus", "");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        $("gistUrl").value = "";
        startImport(e.target.result, null);
    };
    reader.onerror = () => setStatus("csvStatus", "Error reading file", "error");
    reader.readAsText(file);
}

async function handleLoadGist() {
    let ref;
    try {
        ref = parseGistRef($("gistUrl").value);
    } catch (err) {
        setStatus("csvStatus", err.message, "error");
        return;
    }
    setStatus("csvStatus", "Loading the gist…");
    try {
        const text = await fetchGistText(ref);
        $("csvFile").value = "";
        startImport(text, ref);
    } catch (err) {
        setStatus("csvStatus", err.message, "error");
    }
}

async function copyClassLink() {
    const input = $("classLink");
    try {
        await navigator.clipboard.writeText(input.value);
        $("copyLink").textContent = "Copied";
        setTimeout(() => { $("copyLink").textContent = "Copy"; }, 1500);
    } catch {
        input.select();
        setStatus("linkStatus", "Press Cmd+C / Ctrl+C to copy the selected link.");
    }
}

// Load whatever the link carries, then render. On any failure, show the
// error and no roster: falling back to the demo would look right but be wrong.
async function init() {
    const { session, data } = parseHash(location.hash);
    state.session = session ?? newSessionId();

    if (data) {
        $("setup").open = false; // students and presenters land on the roster
        try {
            const config = await decodeConfig(data);
            if (config.baseUrl) state.baseUrl = config.baseUrl;
            if (config.password) state.password = config.password;
            $("baseUrl").value = state.baseUrl;
            $("roomPassword").value = state.password;
            if (config.names) {
                state.names = config.names;
                students = assignIds(config.names);
            } else if (config.gist) {
                state.gist = config.gist;
                $("gistUrl").value = gistPageUrl(config.gist);
                $("hasHeader").checked = config.gist.hasHeader;
                showLoading("Loading the class roster…");
                const text = await fetchGistText(config.gist);
                students = assignIds(rosterNamesFromCSV(text, config.gist));
            }
        } catch (err) {
            showLinkError(err.message);
            students = [];
            $("setup").open = true;
            renderStudentList();
            return; // leave the link as it was
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
$("loadGist").addEventListener("click", handleLoadGist);
$("gistUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLoadGist(); });
$("copyLink").addEventListener("click", copyClassLink);
// Pasting a different class link into this tab: start over from it.
window.addEventListener("hashchange", () => location.reload());

init();
