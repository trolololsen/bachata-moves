const searchInput = document.getElementById("searchInput");
const startPositionSelect = document.getElementById("startPositionSelect");
const endPositionSelect = document.getElementById("endPositionSelect");
const moveTypeSelect = document.getElementById("moveTypeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const videoList = document.getElementById("videoList");

const positions = [
  "open", "closed", "side-by-side", "cross-body", "underarm-turn",
  "inside-turn", "outside-turn", "cuddle", "shadow", "promenade",
  "fan", "back-spot", "slot", "line", "tango-close", "hammerlock",
  "spiral", "wrap", "body-wave", "other"
];

function populatePositions() {
  positions.forEach(p => {
    const option1 = document.createElement("option");
    option1.value = p; option1.text = p;
    startPositionSelect.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = p; option2.text = p;
    endPositionSelect.appendChild(option2);
  });
}

async function loadVideos() {
  const { data, error } = await supabaseClient
    .from("moves")
    .select("*");

  if (error) {
    videoList.innerText = "Error loading videos.";
    console.error(error);
    return;
  }

  window.allVideos = data;
  renderVideos(data);
}

function filterVideos() {
  const searchVal = searchInput.value.toLowerCase();
  const startVal = startPositionSelect.value;
  const endVal = endPositionSelect.value;
  const typeVal = moveTypeSelect.value;
  const diffVal = difficultySelect.value;

  const filtered = (window.allVideos || []).filter(v => {
    return (!searchVal || v.name.toLowerCase().includes(searchVal)) &&
           (!startVal || v.start_position === startVal) &&
           (!endVal || v.end_position === endVal) &&
           (!typeVal || v.type === typeVal) &&
           (!diffVal || v.difficulty === diffVal);
  });

  renderVideos(filtered);
}

function renderVideos(videos) {
  videoList.innerHTML = "";
  if (!videos.length) {
    videoList.innerText = "No moves found.";
    return;
  }

  videos.forEach(v => {
    const div = document.createElement("div");
    div.className = "video-card";
    div.innerHTML = `
      <h3>${v.name}</h3>
      <p>${v.comment || ""}</p>
      <p>Start: ${v.start_position} | End: ${v.end_position} | Type: ${v.type} | Difficulty: ${v.difficulty}</p>
      <video controls width="100%">
        <source src="${v.video_url}" type="video/mp4">
      </video>
    `;
    videoList.appendChild(div);
  });
}

// Event listeners
searchInput.addEventListener("input", filterVideos);
startPositionSelect.addEventListener("change", filterVideos);
endPositionSelect.addEventListener("change", filterVideos);
moveTypeSelect.addEventListener("change", filterVideos);
difficultySelect.addEventListener("change", filterVideos);

// Initialize
populatePositions();
loadVideos();
