const searchInput = document.getElementById("searchInput");
const positionSelect = document.getElementById("positionSelect");
const moveTypeSelect = document.getElementById("moveTypeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const videoList = document.getElementById("videoList");

// Load all videos
async function loadVideos() {
  const { data, error } = await supabaseClient
    .from("videos")
    .select("*");

  if (error) {
    videoList.innerText = "Error loading videos.";
    console.error(error);
    return;
  }

  window.allVideos = data;
  renderVideos(data);
}

// Filter videos
function filterVideos() {
  let filtered = window.allVideos || [];

  const searchValue = searchInput.value.toLowerCase();
  const positionValue = positionSelect.value;
  const typeValue = moveTypeSelect.value;
  const difficultyValue = difficultySelect.value;

  filtered = filtered.filter(v => {
    return (
      (!searchValue || v.title.toLowerCase().includes(searchValue)) &&
      (!positionValue || v.start_position === positionValue) &&
      (!typeValue || v.type === typeValue) &&
      (!difficultyValue || v.difficulty === difficultyValue)
    );
  });

  renderVideos(filtered);
}

// Render video cards
function renderVideos(videos) {
  videoList.innerHTML = "";
  if (!videos.length) {
    videoList.innerText = "No moves found.";
    return;
  }

  videos.forEach(video => {
    const div = document.createElement("div");
    div.className = "video-card";
    div.innerHTML = `
      <h3>${video.title}</h3>
      <p>${video.comment || ""}</p>
      <p>Position: ${video.start_position} | Type: ${video.type} | Difficulty: ${video.difficulty}</p>
      <video controls width="100%">
        <source src="${video.url}" type="video/mp4">
      </video>
    `;
    videoList.appendChild(div);
  });
}

// Event listeners
searchInput.addEventListener("input", filterVideos);
positionSelect.addEventListener("change", filterVideos);
moveTypeSelect.addEventListener("change", filterVideos);
difficultySelect.addEventListener("change", filterVideos);

// Initialize
loadVideos();
