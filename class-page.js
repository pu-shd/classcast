// ClassCast class page: shows the roster a class link describes, with
// Share and View buttons. All setup lives on create.html.
import {
    DEFAULT_BASE_URL, assignIds, defaultStudents, shareUrl, viewUrl, renderStudentRows,
    newSessionId, decodeConfig, parseHash, buildHash, loadRosterNames,
} from "./classcast.js";

const DEFAULT_TITLE = "ClassCast";
const $ = (id) => document.getElementById(id);

function showLoading(text) {
    const div = document.createElement("div");
    div.className = "loading";
    div.textContent = text;
    $("studentList").replaceChildren(div);
}

function showTitle(title) {
    $("pageTitle").textContent = title || DEFAULT_TITLE;
    document.title = title ? `${title} - ${DEFAULT_TITLE}` : `${DEFAULT_TITLE} - Classroom Screen Share`;
}

// On any failure show the error and no roster: falling back to the default
// seats would look right but be wrong.
async function init() {
    const { session: linkSession, data } = parseHash(location.hash);
    const session = linkSession ?? newSessionId();

    let config = {};
    let names = null;
    try {
        if (data) {
            config = await decodeConfig(data);
            showTitle(config.title);
            if (config.gist) showLoading("Loading the class roster…");
            names = await loadRosterNames(config);
        }
    } catch (err) {
        $("linkError").textContent = `${err.message}. Ask your teacher to check the class link.`;
        $("linkError").hidden = false;
        $("studentList").replaceChildren();
        return;
    }

    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const password = config.password ?? "";
    const prefix = `uc_${session}_`;
    renderStudentRows($("studentList"), names ? assignIds(names) : defaultStudents(), {
        share: (id) => shareUrl(baseUrl, prefix + id, password),
        view: (id) => viewUrl(baseUrl, prefix + id, password),
    });

    if (!data) {
        // No class link: give this page a session so its address can be shared as-is.
        history.replaceState(null, "", "#" + buildHash(session, null));
        $("createLink").hidden = false;
    }
}

// Pasting a different class link into this tab: start over from it.
window.addEventListener("hashchange", () => location.reload());

init();
