const movesContainer = document.getElementById("movesContainer");

const positions = [
  "Open","Closed","Cross Body","Side-by-Side","Shadow",
  "Hammerlock","Double Hand Hold","Single Hand Hold",
  "Wrap","Reverse Wrap","Sweetheart","Cradle",
  "Headloop","Pretzel","Cuddle"
];

const types = ["Move","Entry","Exit","Transition","Combo","Styling"];
const difficulties = ["Beginner","Improver","Intermediate","Advanced","Professional"];

function populateSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">All</option>`;
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

populateSelect("filterType", types);
populateSelect("filterStart", positions);
populateSelect("filterEnd", positions);
populateSelect("filterDifficulty", difficulties);

async function loadMoves() {

  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return;

  renderMoves(data);
}

function renderMoves(moves) {
  const search = document.getElementById("search").value.toLowerCase();
  const type = document.getElementById("filterType").value;
  const start = document.getElementById("filterStart").value;
  const end = document.getElementById("filterEnd").value;
  const difficulty = document.getElementById("filterDifficulty").value;

  movesContainer.innerHTML = "";

  moves
    .filter(m =>
      (!type || m.type === type) &&
      (!start || m.start_position === start) &&
      (!end || m.end_position === end) &&
      (!difficulty || m.difficulty === difficulty) &&
      m.name.toLowerCase().includes(search)
    )
    .forEach(m => {

      const div = document.createElement("div");

      div.innerHTML = `
        <h3>${m.name}</h3>
        <p>${m.type} | ${m.start_position} → ${m.end_position} | ${m.difficulty}</p>
        <video src="${m.video_url}" controls width="300"></video>
      `;

      movesContainer.appendChild(div);
    });
}

document.getElementById("search").addEventListener("input", loadMoves);
document.getElementById("filterType").addEventListener("change", loadMoves);
document.getElementById("filterStart").addEventListener("change", loadMoves);
document.getElementById("filterEnd").addEventListener("change", loadMoves);
document.getElementById("filterDifficulty").addEventListener("change", loadMoves);

loadMoves();
