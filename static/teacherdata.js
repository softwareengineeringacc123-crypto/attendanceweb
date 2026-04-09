const supabaseUrl = 'https://nledlxexyhtberdxyyvn.supabase.co';
const supabaseAnonKey = 'sb_publishable_oDKd8Q_vvgdeNqqEltjw3w_ZJToDLOw';


const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// Get elements
const tableBody = document.getElementById("tableBody");
const noDataText = document.getElementById("noDataText");
function toggleMenu() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("active");
}
// Show "no attendance" if empty
function checkIfEmpty() {
    if (tableBody.children.length === 0) {
        noDataText.style.display = "block";
    } else {
        noDataText.style.display = "none";
    }
}

// Add row to the table
function addRow(name, section, date, status) {
    const row = document.createElement("tr");

    row.innerHTML = `
        <td contenteditable="true">${name}</td>
        <td contenteditable="true">${section}</td>
        <td contenteditable="true">${date}</td>
        <td contenteditable="true">${status}</td>
    `;

    tableBody.appendChild(row);
    checkIfEmpty();
}

// Button actions
function openQR() {
    alert("QR Code scanner will open here");
}

function openPassword() {
    alert("Class password attendance will open here");
}

// Run when page loads
checkIfEmpty();