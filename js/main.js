const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");
const videoList = document.getElementById("videoList");

async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  }
}

loginBtn?.addEventListener("click", async () => {
  const email = prompt("Enter email:");
  if (!email) return;

  await supabaseClient.auth.signInWithOtp({ email });
  alert("Check your email for login link.");
});

logoutBtn?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

async function loadVideos() {
  const { data, error } = await supabaseClient
    .from("videos")
    .select("*");

  if (error) {
    console.error(error);
    return;
  }

  renderVideos(data);
}

function renderVideos(videos) {
  videoList.innerHTML = "";

  videos.forEach(video => {
    const div = document.createElement("div");
    div.className = "video-card";
    div.innerHTML = `
      <h3>${video.title}</h3>
      <video controls width="100%">
        <source src="${video.url}" type="video/mp4">
      </video>
    `;
    videoList.appendChild(div);
  });
}

searchInput?.addEventListener("input", async () => {
  const value = searchInput.value;

  const { data } = await supabaseClient
    .from("videos")
    .select("*")
    .ilike("title", `%${value}%`);

  renderVideos(data);
});

checkUser();
loadVideos();
