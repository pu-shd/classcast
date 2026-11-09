// ClassCast class page: shows the roster a class link describes, with
// Share and View buttons. All setup lives on create.html.
import {
    DEFAULT_BASE_URL, assignIds, defaultStudents, shareUrl, viewUrl, renderStudentRows,
    decodeConfig, parseHash, loadRosterNames,
} from "./classcast.js";

const SITE_NAME = "ClassCast";
const DEFAULT_HEADING = "Classroom Screen Share";
const $ = (id) => document.getElementById(id);

function showLoading(text) {
    const div = document.createElement("div");
    div.className = "cc-loading";
    div.textContent = text;
    $("studentList").replaceChildren(div);
}

function showTitle(title) {
    $("pageTitle").textContent = title || DEFAULT_HEADING;
    document.title = title ? `${title} - ${SITE_NAME}` : `${SITE_NAME} - ${DEFAULT_HEADING}`;
}

// On any failure show the error and no roster: falling back to the default
// seats would look right but be wrong.
// A class link is required: without one there's no roster to show and no
// shared session, so the page asks for the link instead.
async function init() {
    const { session, data } = parseHash(location.hash);

    if (!data) {
        $("needLink").hidden = false;
        $("studentsSection").hidden = true;
        $("createLink").hidden = false;
        return;
    }

    let config;
    let names;
    try {
        // Every viewer must share one session, or their stream IDs won't match.
        if (session === null) throw new Error("Class link is damaged (missing session)");
        config = await decodeConfig(data);
        showTitle(config.title);
        if (config.gist) showLoading("Loading the class roster…");
        names = await loadRosterNames(config);
    } catch (err) {
        $("linkError").textContent = `${err.message}. Ask your teacher to check the class link.`;
        $("linkError").hidden = false;
        $("studentsSection").hidden = true;
        return;
    }

    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const password = config.password ?? "";
    const prefix = `uc_${session}_`;
    renderStudentRows($("studentList"), names ? assignIds(names) : defaultStudents(), {
        share: (id) => shareUrl(baseUrl, prefix + id, password),
        view: (id) => viewUrl(baseUrl, prefix + id, password),
    });
}

// Pasting a different class link into this tab: start over from it.
window.addEventListener("hashchange", () => location.reload());

init();
