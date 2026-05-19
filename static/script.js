let selectedFiles = [];
let originalSentRows = [];
let originalReceivedRows = [];
let originalTrashItems = [];

document.addEventListener("DOMContentLoaded", () => {

    const received = document.getElementById("received-list");

    if (!received) return;

    originalReceivedRows = Array.from(
        received.querySelectorAll("tr:not(#no-type-row)")
    ).map(row => row.cloneNode(true));

});
document.addEventListener("DOMContentLoaded", () => {

    const trash = document.getElementById("trash-list");
    if (!trash) return;

    originalTrashItems = Array.from(
        trash.querySelectorAll("tr:not(#no-type-row)")
    ).map(row => row.cloneNode(true));

});

/**
 *
 * ================= SECTION SWITCHING =================
 */
function showSection(id) {
    localStorage.setItem("activeTab", id);

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) section.classList.add('active');

    document.querySelectorAll('.sidebar button').forEach(btn => btn.classList.remove('active-nav'));
    const activeBtn = document.querySelector(`.sidebar button[data-section="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active-nav');
}

window.onload = function () {
    const savedTab = localStorage.getItem("activeTab") || "upload";
    showSection(savedTab);
};


/**
 * ================= FLASH MESSAGE =================
 */
document.addEventListener("DOMContentLoaded", () => {

    // 🔥 EXISTING CODE (flash)
    const flash = document.getElementById("flashMsg");

    if (flash) {
        setTimeout(() => {
            flash.style.opacity = "0";
            flash.style.transform = "translate(-50%, -20px)";
            flash.style.transition = "0.4s ease";

            setTimeout(() => flash.remove(), 400);
        }, 4000);
    }

    // 🔥 ADD THIS BLOCK HERE (VERY IMPORTANT POSITION)
    const tbody = document.getElementById("sent-list");
    if (tbody) {
        originalSentRows = Array.from(
    tbody.querySelectorAll("tr:not(#no-type-row)")
).map(row => row.cloneNode(true));
        
    }
});
/**
 * ================= DRAG & DROP =================
 */
const dropArea = document.getElementById("drop-area");
const fileInput = document.querySelector(".file-input");

if (dropArea && fileInput) {

    // prevent browser opening file
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {

        dropArea.addEventListener(event, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);

    });

    // highlight
    ['dragenter', 'dragover'].forEach(event => {

        dropArea.addEventListener(event, () => {
            dropArea.classList.add('highlight');
        }, false);

    });

    // remove highlight
    ['dragleave', 'drop'].forEach(event => {

        dropArea.addEventListener(event, () => {
            dropArea.classList.remove('highlight');
        }, false);

    });

    // 🔥 HANDLE DROP
    dropArea.addEventListener("drop", function (e) {

        const droppedFiles = Array.from(e.dataTransfer.files);

        droppedFiles.forEach(file => {

            // avoid duplicates
            const exists = selectedFiles.some(f => f.name === file.name);

            if (!exists) {
                selectedFiles.push(file);
            }

        });

        // sync hidden input
        const dt = new DataTransfer();

        selectedFiles.forEach(file => {
            dt.items.add(file);
        });

        fileInput.files = dt.files;

        // update UI
        const fileList = document.getElementById("fileList");

        if (fileList) {

            fileList.innerHTML = `
                <div style="font-weight:700; margin-bottom:8px;">
                    ${selectedFiles.length} file(s) selected
                </div>

                ${selectedFiles.map(f => `<div>${f.name}</div>`).join("")}
            `;
        }

    });

}



/**
 * ================= SEARCH FILTER =================
 */
function filterFiles(input, listId) {
    const filter = input.value.toLowerCase();
    const list = document.getElementById(listId);
    if (!list) return;

    const rows = list.querySelectorAll("tr:not([id^='no-type-row'])");

    let visibleCount = 0;

    rows.forEach(row => {
        const text = row.innerText.toLowerCase();

        if (text.includes(filter)) {
            row.style.display = "";
            visibleCount++;
        } else {
            row.style.display = "none";
        }
    });

    // 🔥 FIX EMPTY STATE PER SECTION
    const section = listId.replace("-list", "");
    const emptyRow = document.getElementById(`no-type-row-${section}`);

    if (emptyRow) {
        emptyRow.style.display = visibleCount === 0 ? "" : "none";
    }
}


/**
 * ================= BULK ACTIONS =================
 */
function getSelectedFiles(listId) {
    const container = document.getElementById(listId);
    if (!container) return [];

    return Array.from(
        container.querySelectorAll(".file-checkbox:checked")
    ).map(cb => cb.value);
}
function bulkDelete() {
    const activeSection = document.querySelector(".section.active").id;
    const listId = activeSection + "-list";

    const ids = getSelectedFiles(listId);

    if (ids.length === 0) {
        alert("No files selected");
        return;
    }

    fetch("/bulk_delete", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ files: ids })
    })
    .then(res => {
        if (!res.ok) throw new Error();
        location.reload();
    })
    .catch(() => alert("Delete failed"));
}


function bulkRestore() {
    const ids = getSelectedFiles("trash-list");

    if (ids.length === 0) {
        alert("No files selected");
        return;
    }

    fetch("/bulk_restore", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ files: ids })
    })
    .then(() => location.reload());
}

function bulkPermanentDelete() {
    const ids = getSelectedFiles("trash-list");

    if (ids.length === 0) {
        alert("No files selected");
        return;
    }

    if (!confirm("This cannot be undone. Continue?")) return;

    fetch("/bulk_permanent_delete", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ files: ids })
    })
    .then(res => {
        if (!res.ok) throw new Error();
        location.reload();
    })
    .catch(() => alert("Delete failed"));
}


/**
 * ================= INIT ANIMATION =================
 */
document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", function () {
        const id = this.dataset.id;

        if (!confirm("Delete this group?")) return;

        fetch(`/delete_list/${id}`, {
            method: "POST"
        })
        .then(() => location.reload());
    });
});


document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", function () {

        const listId = this.dataset.id;

        openGroupModal(true);

        document.getElementById("editingListId").value = listId;

        // 🔥 FETCH FULL DATA
        fetch(`/get_list/${listId}`)
        .then(res => res.json())
        .then(data => {

            // ✅ SET GROUP NAME (FIXED)
            document.getElementById("groupName").value = data.list_name;

            // ✅ LOAD MEMBERS
            selectedMembers = [];

            data.members.forEach(member => {
                selectedMembers.push({
                    username: member.name,
                    email: member.email
                });
            });

            renderSelectedUsers();
        })
        .catch(() => alert("Failed to load group data"));
    });
});


/**
 * ================= PROFILE DROPDOWN =================
 */
function toggleProfile() {
    const dropdown = document.getElementById("profileDropdown");
    if (!dropdown) return;

    dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
}

// Safe outside click
document.addEventListener("click", function (e) {
    const profile = document.querySelector(".profile-container");
    const dropdown = document.getElementById("profileDropdown");

    if (profile && dropdown && !profile.contains(e.target)) {
        dropdown.style.display = "none";
    }
});


/**
 * ================= PROFILE EDIT MODAL =================
 */
function openEditModal() {
    document.getElementById("editModal").style.display = "flex";

    // preload current values (safe)
    document.getElementById("editUsername").value =
        document.querySelector(".profile-info strong").innerText;

    document.getElementById("editEmail").value =
        document.querySelector(".profile-info small").innerText;
}

function closeEditModal() {
    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "none";
}

function saveGroup() {
    const name = document.getElementById("groupName").value.trim();
    const editingId = document.getElementById("editingListId").value;

    const selected = document.querySelectorAll(".user-chip");

    let members = [];

    selected.forEach(chip => {
        members.push({
            name: chip.dataset.name,
            email: chip.dataset.email
        });
    });

    if (!name || members.length === 0) {
        alert("Enter group name and select at least one member");
        return;
    }

    // 🔥 DECIDE CREATE vs UPDATE
    const url = editingId ? `/update_list/${editingId}` : "/create_list";

    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            list_name: name,
            members: members
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert(data.error);
        }
    });
}
/**
 * ================= SELECT ALL =================
 */
function toggleSelectAll(listId, source) {
    const container = document.getElementById(listId);
    if (!container) return;

    const checkboxes = container.querySelectorAll(".file-checkbox");
    checkboxes.forEach(cb => cb.checked = source.checked);

    if (listId === "sent-list") {
        handleCheckboxChange(listId, "deleteBtn", "deleteCount");
    }
    else if (listId === "received-list") {
        handleCheckboxChange(listId, "deleteBtnReceived", "deleteCountReceived");
    }
    else if (listId === "trash-list") {
        handleTrashSelection(); // 🔥 REQUIRED
    }
}


/**
 * ================= GROUP: ADD MEMBER =================
 */
let selectedUsers = [];
let allUsers = [];

// Load users from backend
document.addEventListener("DOMContentLoaded", () => {

    // Injected from Flask
    allUsers = window.ALL_USERS || [];

    const search = document.getElementById("userSearch");
    const dropdown = document.getElementById("userDropdown");

    search.addEventListener("input", function () {
        const value = this.value.toLowerCase();

        dropdown.innerHTML = "";

        if (!value) {
            dropdown.style.display = "none";
            return;
        }

        const filtered = allUsers.filter(u =>
            u.username.toLowerCase().includes(value) ||
            u.email.toLowerCase().includes(value)
        );

        filtered.forEach(user => {

            // prevent duplicates
            if (selectedUsers.some(u => u.email === user.email)) return;

            const div = document.createElement("div");
            div.className = "dropdown-item";
            div.innerText = `${user.username} (${user.email})`;

            div.onclick = () => addUser(user);

            dropdown.appendChild(div);
        });
        dropdown.classList.add("show");
        dropdown.classList.remove("show");
        dropdown.style.display = filtered.length ? "block" : "none";
    });

    // click outside close
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".multi-select")) {
            dropdown.style.display = "none";
        }
    });
});




function removeUser(email) {
    selectedUsers = selectedUsers.filter(u => u.email !== email);
    renderSelectedUsers();
}

function renderSelectedUsers() {
    const container = document.getElementById("selectedUsers");
    container.innerHTML = "";

    selectedUsers.forEach(user => {
        const chip = document.createElement("div");
        chip.className = "user-chip";

        chip.innerHTML = `
            ${user.username}
            <span onclick="removeUser('${user.email}')">×</span>
        `;

        container.appendChild(chip);
    });
}


/**
 * ================= GROUP: SAVE =================
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


/**
 * ================= GROUP: UPDATE =================
 */
function updateGroup(listId) {
    const name = document.getElementById("groupName").value.trim();
    const rows = document.querySelectorAll(".member-row");

    const members = [];

    rows.forEach(row => {
        const inputs = row.querySelectorAll("input");
        members.push({
            name: inputs[0].value.trim(),
            email: inputs[1].value.trim()
        });
    });

    fetch(`/update_list/${listId}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            list_name: name,
            members: members
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            alert(data.error);
        }
    });
}


/**
 * ================= GROUP: DELETE =================
 */
function deleteGroup(listId) {
    if (!confirm("Delete this group?")) return;

    fetch(`/delete_list/${listId}`, {
        method: "POST"
    })
    .then(res => {
        if (!res.ok) throw new Error();
        location.reload();
    })
    .catch(() => alert("Delete failed"));
}
function openGroupModal(isEdit = false) {
    document.getElementById("groupModal").style.display = "flex";

    document.getElementById("modalTitle").innerText =
        isEdit ? "Edit Group" : "Create Group";

    if (!isEdit) {
        document.getElementById("groupName").value = "";
        document.getElementById("editingListId").value = "";
        selectedMembers = [];
        renderSelectedUsers();
    }

    loadUserDropdown();
}
function closeGroupModal() {
    const modal = document.getElementById("groupModal");
    if (modal) modal.style.display = "none";
}


/**
 * ================= GROUP vs EMAIL INPUT =================
 */
const groupSelect = document.querySelector("select[name='list_id']");
const emailInput = document.querySelector("input[name='receivers']");

if (groupSelect && emailInput) {
    groupSelect.addEventListener("change", function () {
        emailInput.disabled = this.value !== "";
    });
}
document.addEventListener("DOMContentLoaded", () => {

    const fileInput = document.querySelector(".file-input");
    const dropText = document.querySelector("#drop-area p");

    if (!fileInput || !dropText) return;

    const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "txt", "zip"];

    function getExtension(name) {
        return name.split(".").pop().toLowerCase();
    }

fileInput.addEventListener("change", function () {
    const newFiles = Array.from(this.files);

    let invalidFiles = [];
    let duplicateFiles = []; // ✅ ADD HERE

    newFiles.forEach(file => {

        const ext = getExtension(file.name);

        // ❌ invalid
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            invalidFiles.push(file.name);
            return;
        }

        // ❌ duplicate
        const exists = selectedFiles.some(f => f.name === file.name);
        if (exists) {
            duplicateFiles.push(file.name); // ✅ ADD HERE
            return;
        }

        // ✅ valid
        selectedFiles.push(file);
    });

    // 🔥 warnings
    if (invalidFiles.length > 0) {
        showWarning(`❌ Not supported:\n${invalidFiles.join("\n")}`);
    }

    if (duplicateFiles.length > 0) {   // ✅ ADD HERE
        showWarning(`⚠ Duplicate skipped:\n${duplicateFiles.join("\n")}`);
    }

    updateUI();
    syncInputFiles();
});

    function updateUI() {
    const fileList = document.getElementById("fileList");

    if (!fileList) return;

    if (selectedFiles.length === 0) {
        fileList.innerText = "No files selected";
        return;
    }

    const names = selectedFiles.map(f => f.name);

    // ✅ ADD COUNT + NAMES
    fileList.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px;">
            ${selectedFiles.length} file(s) selected
        </div>
        <div>
            ${names.join("<br>")}
        </div>
    `;
}

    function syncInputFiles() {
        const dt = new DataTransfer();
        selectedFiles.forEach(file => dt.items.add(file));
        fileInput.files = dt.files;
    }
});
const form = document.querySelector("form");

if (form) {

    form.addEventListener("submit", function () {

        const fileInput = document.querySelector(".file-input");

        const dt = new DataTransfer();

        selectedFiles.forEach(file => {
            dt.items.add(file);
        });

        fileInput.files = dt.files;
    });

    form.addEventListener("submit", function (e) {

        if (selectedFiles.length === 0) {
            e.preventDefault();
            alert("Please select at least one file");
            return;
        }

        const fileInput = document.querySelector(".file-input");

        const dt = new DataTransfer();

        selectedFiles.forEach(file => {
            dt.items.add(file);
        });

        fileInput.files = dt.files;
    });
}
// ================= USER DROPDOWN (GROUP SELECT) =================

let selectedMembers = [];

// Open modal → load users
function loadUserDropdown() {
    const dropdown = document.getElementById("userDropdown");
    const search = document.getElementById("userSearch");

    if (!dropdown || !window.ALL_USERS) return;

    dropdown.innerHTML = "";

    window.ALL_USERS.forEach(user => {
        const div = document.createElement("div");
        div.classList.add("dropdown-item");

        div.innerHTML = `
            <strong>${user.username}</strong><br>
            <small>${user.email}</small>
        `;

        div.onclick = () => addUser(user);

        dropdown.appendChild(div);
    });

    // Search filter
    search.onkeyup = function () {
        const value = this.value.toLowerCase();
        const items = dropdown.querySelectorAll(".dropdown-item");

        items.forEach(item => {
            item.style.display =
                item.innerText.toLowerCase().includes(value)
                ? "block"
                : "none";
        });
    };
}

// Add user to selected list
function addUser(user) {

    // Prevent duplicate
    if (selectedMembers.find(u => u.email === user.email)) return;

    selectedMembers.push(user);
    renderSelectedUsers();
}

// Remove user
function removeUser(email) {
    selectedMembers = selectedMembers.filter(u => u.email !== email);
    renderSelectedUsers();
}

// Render selected UI
function renderSelectedUsers() {
    const container = document.getElementById("selectedUsers");
    container.innerHTML = "";

    selectedMembers.forEach(user => {
        const chip = document.createElement("div");
        chip.classList.add("user-chip");

        // ✅ REQUIRED
        chip.dataset.name = user.username;
        chip.dataset.email = user.email;

        chip.innerHTML = `
            ${user.username}
            <span onclick="removeUser('${user.email}')">✖</span>
        `;

        container.appendChild(chip);
    });
}
// ================= GROUP DROPDOWN =================
// ================= CLEAN GROUP DROPDOWN =================
document.addEventListener("click", function (e) {

    const btn = e.target.closest(".toggle-btn");

    // CLICK ON TOGGLE BUTTON
    if (btn) {
        e.stopPropagation();

        const id = btn.dataset.id;
        const dropdown = document.getElementById(`members-${id}`);

        if (!dropdown) return;

        const isOpen = dropdown.style.display === "block";

        // Close all
        document.querySelectorAll(".group-members-dropdown").forEach(d => {
            d.style.display = "none";
        });

        // Toggle current
        dropdown.style.display = isOpen ? "none" : "block";

        return;
    }

    // CLICK OUTSIDE → CLOSE ALL
    document.querySelectorAll(".group-members-dropdown").forEach(d => {
        d.style.display = "none";
    });

});

function handleCheckboxChange(listId, btnId, countId) {
    const list = document.getElementById(listId);
    const btn = document.getElementById(btnId);
    const countEl = document.getElementById(countId);

    if (!list || !btn) return;

    const checked = list.querySelectorAll(".file-checkbox:checked").length;

    btn.disabled = checked === 0;

    if (countEl) {
        countEl.innerText = checked;
        countEl.style.display = checked > 0 ? "inline-block" : "none";
    }
}
function updateProfile() {
    const username = document.getElementById("editUsername").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const errorBox = document.getElementById("profileError");

    if (!username || !email) {
        errorBox.innerText = "All fields are required";
        return;
    }

    fetch("/update_profile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username,
            email: email
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            location.reload(); // refresh UI
        } else {
            errorBox.innerText = data.error || "Update failed";
        }
    })
    .catch(() => {
        errorBox.innerText = "Server error";
    });
}
// ================= MODE SWITCH =================
document.addEventListener("DOMContentLoaded", () => {

    const radios = document.querySelectorAll("input[name='mode']");
    const individual = document.getElementById("individualInput");
    const group = document.getElementById("groupInput");

    const emailInput = document.getElementById("receiversInput");
    const groupSelect = document.getElementById("groupSelect");

    function toggleMode() {
        const selected = document.querySelector("input[name='mode']:checked").value;

        if (selected === "individual") {
            individual.style.display = "block";
            group.style.display = "none";

            emailInput.disabled = false;
            groupSelect.disabled = true;

        } else {
            individual.style.display = "none";
            group.style.display = "block";

            emailInput.disabled = true;
            groupSelect.disabled = false;
        }
    }

    radios.forEach(r => r.addEventListener("change", toggleMode));

    // 🔥 INITIAL STATE
    toggleMode();
});
const emailinput = document.getElementById("receiversInput");
const suggestionBox = document.getElementById("emailSuggestions");

const domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"];
emailInput.addEventListener("input", function () {
    const value = this.value;
    suggestionBox.innerHTML = "";

    if (!value.includes("@")) {
        suggestionBox.style.display = "none";
        return;
    }

    const [name, partial] = value.split("@");

    const matches = domains.filter(d => d.startsWith(partial));

    if (matches.length === 0) {
        suggestionBox.style.display = "none";
        return;
    }

    matches.forEach(domain => {
        const div = document.createElement("div");
        div.textContent = `${name}@${domain}`;

        div.onclick = () => {
            emailInput.value = `${name}@${domain}`;
            suggestionBox.style.display = "none";
        };

        suggestionBox.appendChild(div);
    });

    suggestionBox.style.display = "block";
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".input-group")) {
        suggestionBox.style.display = "none";
    }
});
function showWarning(message) {
    const warn = document.createElement("div");
    warn.className = "flash-msg";
    warn.style.background = "#ef4444";

    // multi-line support
    warn.innerHTML = message.replace(/\n/g, "<br>");

    document.body.appendChild(warn);

    setTimeout(() => {
        warn.style.opacity = "0";
        warn.style.transform = "translate(-50%, -20px)";
        warn.style.transition = "0.4s ease";

        setTimeout(() => warn.remove(), 400);
    }, 3000);
}
function filterByType(section) {

    const dropdown = event.target;
    const value = dropdown.value;

    const list = document.getElementById(section + "-list");
    if (!list) return;

    const isTable = list.tagName === "TBODY";

    if (isTable) {

        const rows = list.querySelectorAll("tr:not(#no-mode-row)");

        let visibleCount = 0;

        rows.forEach(row => {
            const mode = row.dataset.mode;

            if (value === "both" || mode === value) {
                row.style.display = "";
                visibleCount++;
            } else {
                row.style.display = "none";
            }
        });

        // 🔥 EMPTY STATE
        const emptyRow = document.getElementById(`no-type-row-${section}`);

        if (visibleCount === 0) {
            emptyRow.style.display = "";
        } else {
            emptyRow.style.display = "none";
        }

    } else {
        // ===== RECEIVED LIST (unchanged) =====
        const items = list.querySelectorAll(".file-item");

        items.forEach(item => {
            const type = item.dataset.type;

            if (value === "both" || value === type) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }
        });
    }
}
function smartFileName(name, maxLength = 105) {
    if (name.length <= maxLength) return name;

    const extIndex = name.lastIndexOf(".");
    if (extIndex === -1) return name;

    const ext = name.slice(extIndex);       // .pdf
    const base = name.slice(0, extIndex);

    // 🔥 detect (1), (2), etc.
    const match = base.match(/\(\d+\)$/);

    let suffix = ext;
    let main = base;

    if (match) {
        suffix = match[0] + ext;  // (1)
        main = base.replace(/\(\d+\)$/, "");
    }

    const allowed = maxLength - suffix.length - 3; // 3 for "..."

    if (allowed <= 0) return "..." + suffix;

    return main.slice(0, allowed) + "..." + suffix;
}
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".file-name").forEach(el => {
        const full = el.textContent.trim();

        el.setAttribute("title", full);

        // ✅ APPLY TRUNCATION
        el.textContent = smartFileName(full);
    });
});
function getExtension(name) {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop().toUpperCase() : "";
}

document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll(".file-row").forEach(row => {

        const nameEl = row.querySelector(".file-name");
        const badge = row.querySelector(".file-badge");
        const icon = row.querySelector(".file-icon");

        const full = nameEl.textContent.trim();

        // tooltip
        nameEl.setAttribute("title", full);

        const ext = getExtension(full);

        // 🔥 badge
        badge.textContent = ext || "FILE";

        // 🔥 icon mapping
        if (ext === "PDF") icon.textContent = "📄";
        else if (["PNG","JPG","JPEG"].includes(ext)) icon.textContent = "🖼️";
        else if (ext === "ZIP") icon.textContent = "🗜️";
        else icon.textContent = "📁";

        // 🔥 color mapping
        if (ext === "PDF") {
            badge.style.background = "#fee2e2";
            badge.style.color = "#b91c1c";
        }
        else if (["PNG","JPG","JPEG"].includes(ext)) {
            badge.style.background = "#dcfce7";
            badge.style.color = "#166534";
        }
        else if (ext === "ZIP") {
            badge.style.background = "#fef3c7";
            badge.style.color = "#92400e";
        }
    });

});
let sortState = {
    type: "asc",
    size: "asc"
};

function sortTable(tableId, colIndex, key, order) {

    const table = document.getElementById(tableId);

    if (!table) return;

    const tbody = table.querySelector("tbody");

    if (!tbody) return;

    // 🔥 FIX EMPTY ROW ID
    const section = tableId.replace("-table", "");

    const emptyRow = document.getElementById(
        `no-type-row-${section}`
    );

    // 🔥 GET ONLY VALID ROWS
    const rows = Array.from(
        tbody.querySelectorAll("tr:not([id^='no-type-row'])")
    );

    rows.sort((a, b) => {

        let valA = a.children[colIndex].innerText.trim();
        let valB = b.children[colIndex].innerText.trim();

        // ================= SIZE =================
        if (key === "size") {

            valA = parseFloat(
                valA.replace(/[^\d.]/g, "")
            ) || 0;

            valB = parseFloat(
                valB.replace(/[^\d.]/g, "")
            ) || 0;
        }

        // ================= DATE =================
        else if (key === "date") {

            function parseDate(str) {

                if (!str || str === "-") {
                    return new Date(0);
                }

                // 🔥 REMOVE COMMA
                str = str.replace(",", "");

                const parts = str.split(" ");

                if (parts.length < 5) {
                    return new Date(0);
                }

                const months = {
                    Jan:0, Feb:1, Mar:2, Apr:3,
                    May:4, Jun:5, Jul:6, Aug:7,
                    Sep:8, Oct:9, Nov:10, Dec:11
                };

                let day = parseInt(parts[0]);

                let month = months[parts[1]];

                let year = parseInt(parts[2]);

                let [h,m] = parts[3].split(":");

                let ampm = parts[4];

                h = parseInt(h);
                m = parseInt(m);

                if (ampm === "PM" && h !== 12) {
                    h += 12;
                }

                if (ampm === "AM" && h === 12) {
                    h = 0;
                }

                return new Date(year, month, day, h, m);
            }

            valA = parseDate(valA);
            valB = parseDate(valB);
        }

        // ================= TEXT =================
        else {

            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        // 🔥 ASC / DESC
        return order === "asc"
            ? (valA > valB ? 1 : -1)
            : (valA < valB ? 1 : -1);
    });

    // 🔥 CLEAR + REBUILD
    tbody.innerHTML = "";

    rows.forEach((row, index) => {

        // 🔥 UPDATE SERIAL NUMBER
        if (row.children[1]) {
            row.children[1].innerText = index + 1;
        }

        tbody.appendChild(row);
    });

    // 🔥 KEEP EMPTY ROW LAST
    if (emptyRow) {
        tbody.appendChild(emptyRow);
    }
}
function updateArrows(activeKey) {
    const arrows = {
        type: document.getElementById("type-arrow"),
        size: document.getElementById("size-arrow")
    };

    Object.keys(arrows).forEach(key => {
        if (!arrows[key]) return;

        if (key === activeKey) {
            arrows[key].textContent = sortState[key] === "asc" ? "↑" : "↓";
        } else {
            arrows[key].textContent = "↕";
        }
    });
}

// ▲ (Up button) → swap row 1 and row 2
// ▲ (Up button) → move first row to the bottom
function rotateUp(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector("tbody");
    if (!tbody || tbody.rows.length < 2) return; // Need at least 2 rows

    // Grab the very first row
    const firstRow = tbody.rows[0];

    // appendChild automatically removes it from the top and adds it to the very end
    tbody.appendChild(firstRow);
}

// ▼ (Down button) → move last row to top
function rotateDown(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector("tbody");
    if (!tbody || tbody.rows.length < 2) return; // Need at least 2 rows to move

    // Get the first row and the very last row
    const firstRow = tbody.rows[0];
    const lastRow = tbody.rows[tbody.rows.length - 1];

    // Move the last row before the currently first row
    tbody.insertBefore(lastRow, firstRow);
}

function updateTable(tbody, rows) {

    tbody.innerHTML = "";

    rows.forEach((row, index) => {

        // 🔥 ALWAYS TARGET FIRST TD DIRECTLY
        const firstCell = row.querySelector("td");

        if (firstCell) {
            firstCell.textContent = index + 1;
        }

        tbody.appendChild(row);
        console.log("UPDATING SERIAL...");
    });
}
function refreshSerial(tableId) {
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);

    rows.forEach((row, index) => {
        row.cells[1].textContent = index + 1; // 🔥 FIXED
    });
}
function rebuildTable(tbody, rows) {
    tbody.innerHTML = "";

    rows.forEach((row, index) => {

        const cells = row.querySelectorAll("td");

        const newRow = document.createElement("tr");

        newRow.innerHTML = `
            <td>${index + 1}</td>
            <td>${cells[1].innerHTML}</td>
            <td>${cells[2].innerHTML}</td>
            <td>${cells[3].innerHTML}</td>
            <td>${cells[4].innerHTML}</td>
            <td>${cells[5].innerHTML}</td>
            <td>${cells[6].innerHTML}</td>
        `;

        tbody.appendChild(newRow);
    });
}
// ================= ROW CLICK SELECTION (FINAL FIX) =================


// ================= ROW CLICK SELECTION (FINAL FIX) =================
document.addEventListener("click", function (e) {

    // 🔥 VERY IMPORTANT
    // Allow filename links + preview buttons to work
    if (
        e.target.closest("a") ||
        e.target.closest(".preview-link") ||
        e.target.closest("button") ||
        e.target.closest(".btn-icon") ||
        e.target.type === "checkbox"
    ) {
        return;
    }

    const row = e.target.closest(".file-table tbody tr");

    if (!row) return;

    // remove old active row
    document.querySelectorAll(".file-table tbody tr")
        .forEach(r => r.classList.remove("active-row"));

    // activate current
    row.classList.add("active-row");
});
    function filterType(type) {

    const rows = document.querySelectorAll("#sent-table tbody tr");

    rows.forEach(row => {

        const typeCell = row.children[5]; // 🔥 Type column index

        if (!typeCell) return;

        let fileType = typeCell.innerText.trim().toLowerCase();

        if (fileType === "none") fileType = "";

        if (type === "all" || fileType === type) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }

    });
}
    document.querySelectorAll(".file-table tbody tr")
        .forEach(r => r.classList.remove("active-row"));

    row.classList.add("active-row");

function filterByFileType(select, listId) {

    const selectedType = select.value.toLowerCase();
    const tbody = document.getElementById(listId);

    if (!tbody) return;

    const rows = tbody.querySelectorAll("tr:not([id^='no-type-row'])");

    let visibleCount = 0;

    rows.forEach(row => {

        // 🔥 FIXED INDEX
        const typeCell = listId === "trash-list"
            ? row.children[5]
            : row.children[4];

        if (!typeCell) return;

        const fileType = typeCell.innerText.trim().toLowerCase();

        if (selectedType === "all" || fileType === selectedType) {
            row.style.display = "";
            visibleCount++;
        } else {
            row.style.display = "none";
        }

    });

    const emptyRow = document.getElementById(
        `no-type-row-${listId.replace("-list","")}`
    );

    if (emptyRow) {
        emptyRow.style.display = visibleCount === 0 ? "" : "none";
    }
}
function resetTable() {

    const tbody = document.getElementById("sent-list");
    if (!tbody) return;

    tbody.innerHTML = "";

    originalSentRows.forEach(row => {
        const clone = row.cloneNode(true);
        clone.style.display = "";
        tbody.appendChild(clone);
    });

    // 🔥 ADD EMPTY ROW BACK
    const emptyRow = document.getElementById("no-type-row-sent");
    if (emptyRow) tbody.appendChild(emptyRow);

    // reset filters
    const typeSelect = document.querySelector(".type-filter");
    if (typeSelect) typeSelect.value = "all";

    const search = document.querySelector("input[onkeyup*='sent-list']");
    if (search) search.value = "";
}
function resetReceived() {

    const list = document.getElementById("received-list");
    if (!list) return;

    list.innerHTML = "";

    originalReceivedRows.forEach(row => {
        list.appendChild(row.cloneNode(true));
    });

    // restore empty row
    const emptyRow = document.getElementById("no-type-row-received");
    if (emptyRow) list.appendChild(emptyRow);

    // reset filter
    const select = document.querySelector("#received .type-filter");
    if (select) select.value = "all";

    // reset search
    const search = document.querySelector("input[onkeyup*='received-list']");
    if (search) search.value = "";
}
function resetTrash() {

    const list = document.getElementById("trash-list");
    if (!list) return;

    // 🔥 FULL RESET (same as sent/received)
    list.innerHTML = "";

    originalTrashItems.forEach(row => {
        const clone = row.cloneNode(true);
        clone.style.display = "";
        list.appendChild(clone);
    });

    // restore empty row
    const emptyRow = document.getElementById("no-type-row-trash");
    if (emptyRow) list.appendChild(emptyRow);

    // 🔥 reset dropdown
    const select = document.querySelector("#trash .type-filter");
    if (select) select.value = "all";

    // 🔥 reset search
    const search = document.querySelector("input[onkeyup*='trash-list']");
    if (search) search.value = "";

    // 🔥 reset buttons
    const restoreBtn = document.getElementById("restoreBtn");
    const deleteBtn = document.getElementById("deleteForeverBtn");

    const restoreCount = document.getElementById("restoreCount");
    const deleteCount = document.getElementById("deleteForeverCount");

    if (restoreBtn) restoreBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;

    if (restoreCount) restoreCount.style.display = "none";
    if (deleteCount) deleteCount.style.display = "none";
}
function handleTrashSelection() {

    const list = document.getElementById("trash-list");
    if (!list) return;

    const checked = list.querySelectorAll(".file-checkbox:checked").length;

    const restoreBtn = document.getElementById("restoreBtn");
    const deleteBtn = document.getElementById("deleteForeverBtn");

    const restoreCount = document.getElementById("restoreCount");
    const deleteCount = document.getElementById("deleteForeverCount");

    // enable / disable
    restoreBtn.disabled = checked === 0;
    deleteBtn.disabled = checked === 0;

    // update count
    restoreCount.innerText = checked;
    deleteCount.innerText = checked;

    restoreCount.style.display = checked > 0 ? "inline-block" : "none";
    deleteCount.style.display = checked > 0 ? "inline-block" : "none";
}