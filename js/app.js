const movesContainer = document.getElementById("movesContainer");
const accessMessage = document.getElementById("accessMessage");
const addMoveLink = document.getElementById("addMoveLink");

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");
const authUserInfo = document.getElementById("authUserInfo");

const BASIC_VISIBLE_DIFFICULTIES = ["Beginner"];
const BASIC_MAX_MOVES = 12;

let currentUser = null;
let currentTier = "basic";
let allMoves = [];

const positions = [
  "Open", "Closed", "Cross Body", "Side-by-Side", "Shadow",
  "Hammerlock", "Double Hand Hold", "Single Hand Hold",
  "Wrap", "Reverse Wrap", "Sweetheart", "Cradle",
  "Headloop", "Pretzel", "Cuddle"
];

const types = ["Move", "Entry", "Exit", "Transition", "Combo", "Styling"];
const difficulties = ["Beginner", "Improver", "Intermediate", "Advanced", "Professional"];

function normalizeTier(value) {
  const tier = (value || "").toString().toLowerCase();

  if (["pro", "premium"].includes(tier)) {
    return "pro";
  }

  if (["normal", "plus", "standard"].includes(tier)) {
    return "normal";
  }

  return "basic";
}

async function getUserTier(user) {
  if (!user) return "basic";

  const fromMetadata = normalizeTier(
    user.user_metadata?.tier
    || user.user_metadata?.plan
    || user.app_metadata?.tier
    || user.app_metadata?.plan
  );

  if (fromMetadata !== "basic") return fromMetadata;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile tier lookup failed:", error.message);
    return "basic";
  }

  if (data?.tier) {
    return normalizeTier(data.tier);
  }

  return "basic";
}

function setAuthStatus(message, tone = "info") {
  authStatus.textContent = message || "";
  authStatus.classList.remove("error", "success", "info");
  if (message) {
    authStatus.classList.add(tone);
  }
}

function mapSignInError(error) {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('email not confirmed')) {
    return 'Sign-in failed: email is not confirmed yet. Confirm in your inbox or mark the user confirmed in Supabase Auth.';
  }

  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Sign-in failed: wrong email/password, or user is not created. Create/confirm user in Supabase Auth Users first.';
  }

  if (msg.includes('signup is disabled')) {
    return 'Sign-in failed: email/password auth is disabled in Supabase Auth settings.';
  }

  return `Sign-in failed: ${error?.message || 'Unknown error'}`;
}

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

function dedupeAddMoveLinks() {
  const links = document.querySelectorAll('.header-left a[href="upload.html"]');
  links.forEach((link, index) => {
    if (index > 0) {
      link.remove();
    }
  });
}

function getTierFilteredMoves(moves) {
  if (!currentUser || currentTier === "basic") {
    return moves
      .filter(m => BASIC_VISIBLE_DIFFICULTIES.includes(m.difficulty))
      .slice(0, BASIC_MAX_MOVES);
  }

  return moves;
}

function updateTierUI() {
  dedupeAddMoveLinks();
  addMoveLink.classList.toggle("hidden", currentTier !== "pro");

  if (!currentUser) {
    accessMessage.textContent = "Signed out: thumbnails are blurred and videos are locked. Sign in to unlock playback.";
    return;
  }

  if (currentTier === "basic") {
    accessMessage.textContent = "Basic access: Beginner videos unlocked.";
    return;
  }

  if (currentTier === "normal") {
    accessMessage.textContent = "Normal access: all move content unlocked.";
    return;
  }

  accessMessage.textContent = "Pro access: all content and uploads enabled.";
}

function updateAuthUI() {
  const signedIn = Boolean(currentUser);
  authForm.classList.toggle("hidden", signedIn);
  signOutBtn.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    authUserInfo.textContent = `${currentUser.email} · ${currentTier.toUpperCase()}`;
  } else {
    authUserInfo.textContent = "Signed out";
    if (!authStatus.textContent) setAuthStatus("Please sign in to unlock your tier.", "info");
  }

  updateTierUI();
}

async function loadMoves() {
  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    movesContainer.innerHTML = `<p>${error.message}</p>`;
    return;
  }

  allMoves = data || [];
  renderMoves();
}

function renderMoves() {
  const search = document.getElementById("search").value.toLowerCase();
  const type = document.getElementById("filterType").value;
  const start = document.getElementById("filterStart").value;
  const end = document.getElementById("filterEnd").value;
  const difficulty = document.getElementById("filterDifficulty").value;
  const requiresLoginToPlay = !currentUser;

  movesContainer.innerHTML = "";

  const visibleMoves = getTierFilteredMoves(allMoves)
    .filter(m =>
      (!type || m.type === type) &&
      (!start || m.start_position === start) &&
      (!end || m.end_position === end) &&
      (!difficulty || m.difficulty === difficulty) &&
      m.name.toLowerCase().includes(search)
    );

  if (!visibleMoves.length) {
    movesContainer.innerHTML = "<p>No moves match your current filters/access level.</p>";
    return;
  }

  visibleMoves.forEach(m => {
    const div = document.createElement("div");
    div.className = "move-card";

    div.innerHTML = `
      <h3>${m.name}</h3>
      <p>${m.type} | ${m.start_position} → ${m.end_position} | ${m.difficulty}</p>
      <div class="video-wrap ${requiresLoginToPlay ? "locked" : ""}">
        <video src="${m.video_url}" ${requiresLoginToPlay ? 'preload="metadata" muted playsinline tabindex="-1"' : 'controls'} width="300"></video>
        ${requiresLoginToPlay ? '<div class="locked-overlay">Sign in to play</div>' : ''}
      </div>
    `;

    movesContainer.appendChild(div);
  });
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  currentTier = await getUserTier(currentUser);
  updateAuthUI();

  if (currentUser) {
    setAuthStatus(`Logged in as ${currentUser.email}.`, "success");
  }

  renderMoves();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthStatus("Signing in...", "info");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPassword.value
  });

  setAuthStatus(error ? mapSignInError(error) : "Signed in successfully.", error ? "error" : "success");

  if (!error) {
    authPassword.value = "";
    const { data } = await supabaseClient.auth.getSession();
    await handleAuthState(data.session);
  }
});

signOutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  setAuthStatus(error ? `Sign-out failed: ${error.message}` : "Signed out.", error ? "error" : "info");
});

document.getElementById("search").addEventListener("input", renderMoves);
document.getElementById("filterType").addEventListener("change", renderMoves);
document.getElementById("filterStart").addEventListener("change", renderMoves);
document.getElementById("filterEnd").addEventListener("change", renderMoves);
document.getElementById("filterDifficulty").addEventListener("change", renderMoves);

populateSelect("filterType", types);
populateSelect("filterStart", positions);
populateSelect("filterEnd", positions);
populateSelect("filterDifficulty", difficulties);

supabaseClient.auth.onAuthStateChange((_event, session) => {
  handleAuthState(session);
});

(async function init() {
  dedupeAddMoveLinks();
  await loadMoves();
  const { data } = await supabaseClient.auth.getSession();
  await handleAuthState(data.session);
})();