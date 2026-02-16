const uploadAccessMessage = document.getElementById("uploadAccessMessage");
const uploadFormSection = document.getElementById("uploadFormSection");
const authUserInfo = document.getElementById("authUserInfo");
const signOutBtn = document.getElementById("signOutBtn");
const status = document.getElementById("status");

let currentUser = null;
let currentTier = "basic";

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

  if (!error && data?.tier) {
    return normalizeTier(data.tier);
  }

  return "basic";
}

function updateAccessUI() {
  signOutBtn.classList.toggle("hidden", !currentUser);

  if (!currentUser) {
    authUserInfo.textContent = "No active session";
    uploadAccessMessage.textContent = "Please sign in first. Only Pro users can upload.";
    uploadFormSection.classList.add("hidden");
    return;
  }

  authUserInfo.textContent = `${currentUser.email} · ${currentTier.toUpperCase()}`;

  if (currentTier !== "pro") {
    uploadAccessMessage.textContent = "Uploads are only available for Pro access.";
    uploadFormSection.classList.add("hidden");
    return;
  }

  uploadAccessMessage.textContent = "Pro access confirmed. You can upload moves.";
  uploadFormSection.classList.remove("hidden");
}

async function refreshAuthState() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  currentTier = await getUserTier(currentUser);
  updateAccessUI();
}

document.getElementById("uploadBtn").addEventListener("click", async () => {
  if (!currentUser || currentTier !== "pro") {
    status.innerText = "Upload blocked: Pro access is required.";
    return;
  }

  const name = document.getElementById("name").value.trim();
  const type = document.getElementById("type").value;
  const startPosition = document.getElementById("start_position").value;
  const endPosition = document.getElementById("end_position").value;
  const difficulty = document.getElementById("difficulty").value;
  const comment = document.getElementById("comment").value.trim();
  const file = document.getElementById("videoFile").files[0];

  if (!name || !type || !startPosition || !endPosition || !difficulty || !file) {
    status.innerText = "Please fill all required fields and select a video.";
    return;
  }

  status.innerText = "Uploading video...";

  const fileName = Date.now() + "-" + file.name.replace(/\s+/g, "_");

  const { error: uploadError } = await supabaseClient
    .storage
    .from("videos")
    .upload(fileName, file);

  if (uploadError) {
    status.innerText = "Video upload failed: " + uploadError.message;
    return;
  }

  const { data: publicData } = supabaseClient
    .storage
    .from("videos")
    .getPublicUrl(fileName);

  const videoUrl = publicData.publicUrl;

  status.innerText = "Saving move to database...";

  const { error: dbError } = await supabaseClient
    .from("moves")
    .insert({
      name: name,
      type: type,
      start_position: startPosition,
      end_position: endPosition,
      difficulty: difficulty,
      video_url: videoUrl,
      comment: comment
    });

  if (dbError) {
    status.innerText = "Database error: " + dbError.message;
    return;
  }

  status.innerText = "Move added successfully!";
});

signOutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    uploadAccessMessage.textContent = error.message;
  }
});

supabaseClient.auth.onAuthStateChange(() => {
  refreshAuthState();
});

refreshAuthState();
