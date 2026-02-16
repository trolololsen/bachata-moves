const uploadAccessMessage = document.getElementById("uploadAccessMessage");
const uploadFormSection = document.getElementById("uploadFormSection");
const authUserInfo = document.getElementById("authUserInfo");
const signOutBtn = document.getElementById("signOutBtn");
const status = document.getElementById("status");
const uploadBtn = document.getElementById("uploadBtn");

let currentUser = null;
let currentTier = "basic";

function setElementText(el, text) {
  if (el) el.textContent = text;
}

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

function normalizeType(value) {
  const type = (value || "").toString().trim().toLowerCase();
  if (["entry", "exit", "transition", "position change"].includes(type)) return "Position Change";
  if (type === "footwork") return "Footwork";
  if (type === "styling") return "Styling";
  if (type === "combo") return "Combo";
  return "Move";
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
  if (signOutBtn) signOutBtn.classList.toggle("hidden", !currentUser);

  if (!currentUser) {
    setElementText(authUserInfo, "No active session");
    setElementText(uploadAccessMessage, "Please sign in first. Only Pro users can upload.");
    if (uploadFormSection) uploadFormSection.classList.add("hidden");
    return;
  }

  setElementText(authUserInfo, `${currentUser.email} · ${currentTier.toUpperCase()}`);

  if (currentTier !== "pro") {
    setElementText(uploadAccessMessage, "Uploads are only available for Pro access.");
    if (uploadFormSection) uploadFormSection.classList.add("hidden");
    return;
  }

  setElementText(uploadAccessMessage, "Pro access confirmed. You can upload moves.");
  if (uploadFormSection) uploadFormSection.classList.remove("hidden");
}

async function refreshAuthState() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  currentTier = await getUserTier(currentUser);
  updateAccessUI();
}

if (uploadBtn) {
  uploadBtn.addEventListener("click", async () => {
    if (!currentUser || currentTier !== "pro") {
      setElementText(status, "Upload blocked: Pro access is required.");
      return;
    }

    const name = document.getElementById("name")?.value.trim();
    const type = normalizeType(document.getElementById("type")?.value);
    const startPosition = document.getElementById("start_position")?.value;
    const endPosition = document.getElementById("end_position")?.value;
    const difficulty = document.getElementById("difficulty")?.value;
    const comment = document.getElementById("comment")?.value.trim();
    const file = document.getElementById("videoFile")?.files?.[0];
    const copyrightConfirmed = document.getElementById("copyrightConfirm")?.checked;

    if (!name || !type || !startPosition || !endPosition || !difficulty || !file) {
      setElementText(status, "Please fill all required fields and select a video.");
      return;
    }

    if (!copyrightConfirmed) {
      setElementText(status, "Please confirm you have rights to upload this video.");
      return;
    }

    setElementText(status, "Uploading video...");

    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from("videos")
      .upload(fileName, file);

    if (uploadError) {
      setElementText(status, `Video upload failed: ${uploadError.message}`);
      return;
    }

    const { data: publicData } = supabaseClient
      .storage
      .from("videos")
      .getPublicUrl(fileName);

    const videoUrl = publicData.publicUrl;

    setElementText(status, "Saving move to database...");

    const payload = {
      name,
      type,
      start_position: startPosition,
      end_position: endPosition,
      difficulty,
      video_url: videoUrl,
      comment,
      uploader_id: currentUser?.id,
      uploader_email: currentUser?.email
    };

    let { error: dbError } = await supabaseClient
      .from("moves")
      .insert(payload);

    if (dbError && (dbError.message || "").toLowerCase().includes("column")) {
      const fallback = {
        name,
        type,
        start_position: startPosition,
        end_position: endPosition,
        difficulty,
        video_url: videoUrl,
        comment
      };

      ({ error: dbError } = await supabaseClient
        .from("moves")
        .insert(fallback));
    }

    if (dbError) {
      setElementText(status, `Database error: ${dbError.message}`);
      return;
    }

    setElementText(status, "Move added successfully!");
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setElementText(uploadAccessMessage, error.message);
    }
  });
}

supabaseClient.auth.onAuthStateChange(() => {
  refreshAuthState();
});

refreshAuthState();