// ClassCast create page: builds the class link from a title, settings and
// a roster (typed inline, imported from CSV, or read from a secret gist).
// The class page itself is index.html.
import {
    DEFAULT_BASE_URL, LIMITS, parseCSV, detectNameColumn, rosterNamesFromCSV,
    renderColumnOptions, cleanText, normalizeBaseUrl, newSessionId, encodeConfig, decodeConfig,
    parseHash, buildHash, parseGistRef, gistPageUrl, fetchGistText, loadRosterNames,
    classLinkUrl, parseClassLink, defaultStudents, rosterFromEditor,
} from "./classcast.js";

const $ = (id) => document.getElementById(id);

const LINK_NOTE_NAMES = "The roster lives in the link itself and is never uploaded. Anyone with the link can see the names and room password.";
const LINK_NOTE_GIST = "The class page reads your gist each time it opens; GitHub can take up to 5 minutes to show edits. Anyone with the link can see the names and room password.";
const LINK_NOTE_SEATS = "No roster: the class page lists Student 001–020. Anyone with the link can see the room password.";

const state = {
    session: "",
    title: "",
    baseUrl: DEFAULT_BASE_URL,
    password: "",
    names: null, // roster carried in the link, or null
    gist: null, // { user, id, file?, hasHeader, column } when the roster comes from a gist
};
let csvText = null; // CSV being imported, from a file or a gist
let csvGistRef = null; // set when csvText came from a gist
let linkWriteSeq = 0;

function setStatus(id, text, kind) {
    const el = $(id);
    el.textContent = text;
    el.className = "pt-field__hint cc-status" + (kind ? ` cc-status--${kind}` : "");
}

const defaultNames = () => defaultStudents().map((s) => s.name);

// --- Inline roster editor -------------------------------------------------
// One text field per student. Rows are only rebuilt on structural changes
// (import, add, remove, reset), so typing never loses focus.

function nameInputs() {
    return [...$("rosterList").querySelectorAll("input")];
}

function relabelRows() {
    nameInputs().forEach((input, i) => {
        input.setAttribute("aria-label", `Student ${i + 1} name`);
        input.nextElementSibling?.setAttribute("aria-label", `Remove student ${i + 1}`);
    });
}

function makeRow(name, readonly) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "roster-row";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pt-input";
    input.value = name;
    input.maxLength = LIMITS.maxNameLength;
    input.spellcheck = false;
    input.readOnly = readonly;
    row.append(input);
    if (!readonly) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "pt-btn pt-btn--outline cc-btn-remove btn-remove";
        remove.textContent = "×";
        row.append(remove);
    }
    li.append(row);
    return li;
}

// readonly: the names come from a gist, which stays the source of truth.
function renderEditor(names, { readonly = false } = {}) {
    $("rosterList").replaceChildren(...names.map((n) => makeRow(n, readonly)));
    $("gistNote").hidden = !readonly;
    $("addStudent").hidden = readonly;
    $("resetRoster").hidden = readonly;
    relabelRows();
    updateRosterText();
}

function updateRosterText() {
    const count = nameInputs().filter((i) => i.value.trim()).length;
    $("addStudent").disabled = nameInputs().length >= LIMITS.maxStudents;
    if (state.gist) {
        $("rosterHeading").textContent = `Students (${count}, from your gist)`;
        setStatus("rosterHint", "");
    } else if (state.names) {
        $("rosterHeading").textContent = `Students (${state.names.length})`;
        setStatus("rosterHint", "Names are saved in the class link. Blank rows are skipped.");
    } else {
        $("rosterHeading").textContent = "Students";
        setStatus("rosterHint", "Numbered seats by default. Type names over them, add or remove rows; blank rows are skipped.");
    }
}

function onEditorChange() {
    if (state.gist) return;
    try {
        state.names = rosterFromEditor(nameInputs().map((i) => i.value));
    } catch (err) {
        setStatus("rosterHint", err.message, "error");
        return;
    }
    updateRosterText();
    writeLink();
}

function insertRow(afterIndex) {
    if (nameInputs().length >= LIMITS.maxStudents) return;
    const li = makeRow("", false);
    const items = $("rosterList").children;
    if (afterIndex >= 0 && afterIndex < items.length - 1) items[afterIndex].after(li);
    else $("rosterList").append(li);
    relabelRows();
    updateRosterText();
    li.querySelector("input").focus();
}

function handleRosterClick(event) {
    const remove = event.target.closest(".btn-remove");
    if (!remove) return;
    const li = remove.closest("li");
    const next = li.nextElementSibling ?? li.previousElementSibling;
    li.remove();
    relabelRows();
    onEditorChange();
    next?.querySelector("input")?.focus();
}

function handleRosterKeydown(event) {
    if (event.key !== "Enter" || event.target.tagName !== "INPUT" || state.gist) return;
    event.preventDefault();
    insertRow(nameInputs().indexOf(event.target));
}

function resetRoster() {
    state.names = null;
    state.gist = null;
    renderEditor(defaultNames());
    setStatus("csvStatus", "");
    writeLink();
}

// Stop using the gist: keep its current names, now editable and saved in the link.
function detachGist() {
    const names = nameInputs().map((i) => i.value);
    state.gist = null;
    renderEditor(names);
    onEditorChange();
    setStatus("csvStatus", "Stopped using the gist; the names are now saved in the class link.", "success");
}

// Rebuild the class link. This page's own address mirrors it, so a refresh
// keeps the draft.
async function writeLink() {
    const seq = ++linkWriteSeq;
    const hasData = state.names || state.gist || state.password || state.title || state.baseUrl !== DEFAULT_BASE_URL;
    const data = hasData
        ? await encodeConfig({
            names: state.names ?? undefined,
            gist: state.gist ?? undefined,
            baseUrl: state.baseUrl,
            password: state.password,
            title: state.title,
        })
        : null;
    if (seq !== linkWriteSeq) return; // a newer change already won
    history.replaceState(null, "", "#" + buildHash(state.session, data));
    const link = classLinkUrl(location.href, state.session, data);
    $("classLink").value = link;
    $("openLink").href = link;
    if (link.length > 8000) {
        setStatus("linkStatus", "This link is very long; some apps may cut it off. Consider a gist roster.", "error");
    } else {
        setStatus("linkStatus", state.gist ? LINK_NOTE_GIST : state.names ? LINK_NOTE_NAMES : LINK_NOTE_SEATS);
    }
}

function onConfigInput() {
    try {
        state.baseUrl = normalizeBaseUrl($("baseUrl").value);
        state.password = cleanText($("roomPassword").value, LIMITS.maxPasswordLength);
        state.title = cleanText($("classTitle").value, LIMITS.maxTitleLength);
        setStatus("configStatus", "");
    } catch (err) {
        setStatus("configStatus", err.message, "error");
        return; // keep the last valid settings
    }
    writeLink();
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

async function importFromColumn(column) {
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
        state.names = rosterFromEditor(names);
        state.gist = null;
    }
    renderEditor(names, { readonly: Boolean(csvGistRef) });
    await writeLink();
    const from = csvGistRef ? " from the gist" : "";
    setStatus("csvStatus", `Imported ${names.length} student${names.length !== 1 ? "s" : ""}${from} into the list above.`, "success");
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

// Editing: point this page at the pasted link; the reload loads it.
function handleLoadExisting() {
    try {
        const { session, data } = parseClassLink($("existingLink").value);
        location.hash = buildHash(session, data);
    } catch (err) {
        setStatus("existingStatus", err.message, "error");
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

// Start from this page's own hash: blank for a new link, or a class link
// being edited.
async function init() {
    const { session, data } = parseHash(location.hash);
    state.session = session ?? newSessionId();

    if (data) {
        let config;
        try {
            config = await decodeConfig(data);
        } catch (err) {
            $("editSection").open = true;
            setStatus("existingStatus", `${err.message}. Its session is kept; set the roster and settings again.`, "error");
            config = {};
        }
        state.title = config.title ?? "";
        state.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
        state.password = config.password ?? "";
        state.names = config.names ?? null;
        state.gist = config.gist ?? null;
        if (config.names || config.gist) {
            $("editSection").open = true;
            setStatus("existingStatus", "Editing an existing class link. Its session is kept, so students' Share links don't change.", "success");
        }
    }

    if (state.gist) {
        $("importSection").open = true;
        $("gistUrl").value = gistPageUrl(state.gist);
        $("hasHeader").checked = state.gist.hasHeader;
        setStatus("csvStatus", "Loading the gist…");
        renderEditor([], { readonly: true });
        try {
            const names = await loadRosterNames({ gist: state.gist });
            renderEditor(names ?? [], { readonly: true });
            setStatus("csvStatus", `The gist lists ${names?.length ?? 0} students.`, "success");
        } catch (err) {
            setStatus("csvStatus", `${err.message}. The link still points at this gist.`, "error");
        }
    } else {
        renderEditor(state.names ?? defaultNames());
    }

    $("classTitle").value = state.title;
    $("baseUrl").value = state.baseUrl;
    $("roomPassword").value = state.password;
    await writeLink();
}

$("classTitle").addEventListener("input", onConfigInput);
$("baseUrl").addEventListener("input", onConfigInput);
$("roomPassword").addEventListener("input", onConfigInput);
$("csvFile").addEventListener("change", handleFileSelect);
$("hasHeader").addEventListener("change", updateColumnSelector);
$("columnSelect").addEventListener("change", (e) => importFromColumn(parseInt(e.target.value, 10)));
$("loadGist").addEventListener("click", handleLoadGist);
$("gistUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLoadGist(); });
$("loadExisting").addEventListener("click", handleLoadExisting);
$("existingLink").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLoadExisting(); });
$("copyLink").addEventListener("click", copyClassLink);
$("rosterList").addEventListener("input", onEditorChange);
$("rosterList").addEventListener("click", handleRosterClick);
$("rosterList").addEventListener("keydown", handleRosterKeydown);
$("addStudent").addEventListener("click", () => insertRow(-1));
$("resetRoster").addEventListener("click", resetRoster);
$("detachGist").addEventListener("click", detachGist);
window.addEventListener("hashchange", () => location.reload());

init();
