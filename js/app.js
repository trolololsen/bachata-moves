const movesContainer = document.getElementById("movesContainer");
const accessMessage = document.getElementById("accessMessage");
const addMoveLink = document.getElementById("addMoveLink");

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");
const authUserInfo = document.getElementById("authUserInfo");

const myMovesToggle = document.getElementById("filterMyMoves");
const myFavoritesToggle = document.getElementById("filterFavorites");

const BASIC_VISIBLE_DIFFICULTIES = ["Beginner"];
const BASIC_MAX_MOVES = 12;
const PREFERRED_TYPES = ["Move", "Position Change", "Combo", "Styling", "Footwork"];

let currentUser = null;
let currentTier = "basic";
let allMoves = [];
let favoriteMoveIds = new Set();

const positions = [
  "Open", "Closed", "Cross Body", "Side-by-Side", "Shadow",
  "Hammerlock", "Double Hand Hold", "Single Hand Hold",
  "Wrap", "Reverse Wrap", "Sweetheart", "Cradle",
  "Headloop", "Pretzel", "Cuddle"
];

const difficulties = ["Beginner", "Improver", "Intermediate", "Advanced", "Professional"];

function setElementText(el, text) {
  if (el) {
    el.textContent = text;
  }
}

function normalizeTier(value) {
  const tier = (value || "").toString().toLowerCase();

  if (["pro", "premium"].includes(tier)) return "pro";
  if (["normal", "plus", "standard"].includes(tier)) return "normal";

  return "basic";
}

function normalizeType(type) {
  const raw = (type || "").trim();
  const lower = raw.toLowerCase();

  if (["entry", "exit", "transition"].includes(lower)) {
    return "Position Change";
  }

  if (lower === "footwork") return "Footwork";
  if (lower === "position change") return "Position Change";

  return raw || "Move";
}

function getFavoritesStorageKey() {
  return `favorites_${currentUser?.id || "anon"}`;
}

function loadFavorites() {
  const raw = localStorage.getItem(getFavoritesStorageKey());
  try {
    const ids = JSON.parse(raw || "[]");
    favoriteMoveIds = new Set(Array.isArray(ids) ? ids : []);
  } catch {
    favoriteMoveIds = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem(getFavoritesStorageKey(), JSON.stringify([...favoriteMoveIds]));
}

function toggleFavorite(moveId) {
  if (favoriteMoveIds.has(moveId)) {
    favoriteMoveIds.delete(moveId);
  } else {
    favoriteMoveIds.add(moveId);
  }

  saveFavorites();
  renderMoves();
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

  if (data?.tier) return normalizeTier(data.tier);

  return "basic";
}

function setAuthStatus(message, tone = "info") {
  if (!authStatus) return;

  authStatus.textContent = message || "";
  authStatus.classList.remove("error", "success", "info");

  if (message) {
    authStatus.classList.add(tone);
  }
}

function mapSignInError(error) {
  const msg = (error?.message || "").toLowerCase();

  if (msg.includes("email not confirmed")) {
    return "Sign-in failed: email is not confirmed yet. Confirm in your inbox or mark the user confirmed in Supabase Auth.";
  }

  if (msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
    return "Sign-in failed: wrong email/password, or user is not created. Create/confirm user in Supabase Auth Users first.";
  }

  if (msg.includes("signup is disabled")) {
    return "Sign-in failed: email/password auth is disabled in Supabase Auth settings.";
  }

  return `Sign-in failed: ${error?.message || "Unknown error"}`;
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = `<option value="">All</option>`;
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function populateTypeSelectFromMoves(moves) {
  const normalizedTypes = new Set(PREFERRED_TYPES);

  moves.forEach(m => normalizedTypes.add(normalizeType(m.type)));

  const ordered = [
    ...PREFERRED_TYPES,
    ...[...normalizedTypes].filter(t => !PREFERRED_TYPES.includes(t)).sort()
  ];

  populateSelect("filterType", ordered);
}

function dedupeAddMoveLinks() {
  const links = document.querySelectorAll('.header-left a[href="upload.html"]');
  links.forEach((link, index) => {
    if (index > 0) link.remove();
  });
}

function getTierFilteredMoves(moves) {
  if (!currentUser || currentTier === "basic") {
    return moves
      .filter(m => m.difficulty === "Beginner")
      .slice(0, BASIC_MAX_MOVES);
  }

  return moves;
}

function updateTierUI() {
  dedupeAddMoveLinks();

  if (addMoveLink) {
    addMoveLink.classList.toggle("hidden", currentTier !== "pro");
  }

  if (myMovesToggle) {
    myMovesToggle.disabled = !(currentUser && currentTier === "pro");
    if (myMovesToggle.disabled) myMovesToggle.checked = false;
  }

  if (!currentUser) {
    setElementText(accessMessage, "Signed out: preview list shown. Sign in to play videos and unlock your tier content.");
    return;
  }

  if (currentTier === "basic") {
    setElementText(accessMessage, "Basic access: Beginner videos unlocked.");
    return;
  }

  if (currentTier === "normal") {
    setElementText(accessMessage, "Normal access: all move content unlocked.");
    return;
  }

  setElementText(accessMessage, "Pro access: all content, uploads, and My Moves filter enabled.");
}

function updateAuthUI() {
  const signedIn = Boolean(currentUser);

  if (authForm) authForm.classList.toggle("hidden", signedIn);
  if (signOutBtn) signOutBtn.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    setElementText(authUserInfo, `${currentUser.email} · ${currentTier.toUpperCase()}`);
  } else {
    setElementText(authUserInfo, "Signed out");
    if (!authStatus?.textContent) {
      setAuthStatus("Please sign in to unlock your tier.", "info");
    }
  }

  updateTierUI();
}

async function loadMoves() {
  if (!movesContainer) return;

  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    movesContainer.innerHTML = `<p>${error.message}</p>`;
    return;
  }

  allMoves = (data || []).map(m => ({ ...m, normalized_type: normalizeType(m.type) }));
  populateTypeSelectFromMoves(allMoves);
  renderMoves();
}

function moveId(m) {
  return m.id || `${m.name}-${m.video_url}-${m.created_at}`;
}

function getUploaderLabel(m) {
  return m.uploader_email
    || m.uploaded_by_email
    || m.created_by_email
    || m.owner_email
    || (m.uploader_id ? `User ${String(m.uploader_id).slice(0, 8)}` : "Unknown uploader");
}

function renderMoves() {
  if (!movesContainer) return;

  const search = (document.getElementById("search")?.value || "").toLowerCase();
  const type = document.getElementById("filterType")?.value || "";
  const start = document.getElementById("filterStart")?.value || "";
  const end = document.getElementById("filterEnd")?.value || "";
  const difficulty = document.getElementById("filterDifficulty")?.value || "";
  const myMovesOnly = Boolean(myMovesToggle?.checked && currentUser && currentTier === "pro");
  const favoritesOnly = Boolean(myFavoritesToggle?.checked);

  movesContainer.innerHTML = "";

  const visibleMoves = getTierFilteredMoves(allMoves)
    .filter(m =>
      (!type || m.normalized_type === type) &&
      (!start || m.start_position === start) &&
      (!end || m.end_position === end) &&
      (!difficulty || m.difficulty === difficulty) &&
      (!myMovesOnly || m.uploader_id === currentUser.id || m.uploader_email === currentUser.email) &&
      (!favoritesOnly || favoriteMoveIds.has(moveId(m))) &&
      m.name.toLowerCase().includes(search)
    );

  if (!visibleMoves.length) {
    movesContainer.innerHTML = "<p>No moves match your current filters/access level.</p>";
    return;
  }

  visibleMoves.forEach(m => {
    const div = document.createElement("div");
    div.className = "move-card";

    const id = moveId(m);
    const isFavorite = favoriteMoveIds.has(id);
    const canPlay = Boolean(currentUser);

    div.innerHTML = `
      <h3>${m.name}</h3>
      <p>${m.normalized_type} | ${m.start_position} → ${m.end_position} | ${m.difficulty}</p>
      <p>Uploaded by: ${getUploaderLabel(m)}</p>
      <div class="video-wrap ${canPlay ? "" : "locked"}">
        ${canPlay
          ? `<video src="${m.video_url}" controls width="300" preload="metadata" playsinline></video>`
          : `<div class="locked-preview">Sign in to play</div>`}
      </div>
      <button class="favorite-btn ${isFavorite ? "active" : ""}" data-move-id="${id}" ${currentUser ? "" : "disabled"}>
        ${isFavorite ? "★ Favorited" : "☆ Favorite"}
      </button>
    `;

    movesContainer.appendChild(div);
  });

  movesContainer.querySelectorAll(".favorite-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleFavorite(btn.dataset.moveId);
    });
  });
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  currentTier = await getUserTier(currentUser);
  loadFavorites();
  updateAuthUI();

  if (currentUser) {
    setAuthStatus(`Logged in as ${currentUser.email}.`, "success");
  }

  renderMoves();
}

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthStatus("Signing in...", "info");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail?.value.trim(),
    password: authPassword?.value
  });

  setAuthStatus(error ? mapSignInError(error) : "Signed in successfully.", error ? "error" : "success");

  if (!error) {
    if (authPassword) authPassword.value = "";
    const { data } = await supabaseClient.auth.getSession();
    await handleAuthState(data.session);
  }
});

signOutBtn?.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  setAuthStatus(error ? `Sign-out failed: ${error.message}` : "Signed out.", error ? "error" : "info");
});

document.getElementById("search")?.addEventListener("input", renderMoves);
document.getElementById("filterType")?.addEventListener("change", renderMoves);
document.getElementById("filterStart")?.addEventListener("change", renderMoves);
document.getElementById("filterEnd")?.addEventListener("change", renderMoves);
document.getElementById("filterDifficulty")?.addEventListener("change", renderMoves);
myMovesToggle?.addEventListener("change", renderMoves);
myFavoritesToggle?.addEventListener("change", renderMoves);

populateSelect("filterStart", positions);
populateSelect("filterEnd", positions);
populateSelect("filterDifficulty", difficulties);

supabaseClient.auth.onAuthStateChange((_event, session) => {
  handleAuthState(session);
});

(async function init() {
  dedupeAddMoveLinks();
  loadFavorites();
  await loadMoves();
  const { data } = await supabaseClient.auth.getSession();
  await handleAuthState(data.session);
})();