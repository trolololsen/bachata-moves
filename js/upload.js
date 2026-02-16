const uploadAccessMessage = document.getElementById("uploadAccessMessage");
const uploadFormSection = document.getElementById("uploadFormSection");
const authUserInfo = document.getElementById("authUserInfo");
const signOutBtn = document.getElementById("signOutBtn");
const status = document.getElementById("status");
const uploadBtn = document.getElementById("uploadBtn");
const sourceType = document.getElementById("sourceType");
const videoFileRow = document.getElementById("videoFileRow");
const embedFields = document.getElementById("embedFields");

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_CLIP_LENGTH_SECONDS = 15;
const MAX_EMBED_CLIP_LENGTH_SECONDS = 10;

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

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(previewUrl);
      resolve(duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error("Could not read video metadata."));
    };

    video.src = previewUrl;
  });
}

function parseTimeToSeconds(value) {
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = value.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (!match) return null;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = (hours * 3600) + (minutes * 60) + seconds;

  return Number.isFinite(total) && total > 0 ? total : null;
}

function getYoutubeVideoId(rawUrl) {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname;

  if (host === "youtu.be") {
    return path.replace("/", "").split("/")[0] || "";
  }

  if (!host.endsWith("youtube.com")) {
    return "";
  }

  if (path === "/watch") {
    return parsed.searchParams.get("v") || "";
  }

  if (path.startsWith("/shorts/") || path.startsWith("/embed/")) {
    return path.split("/")[2] || "";
  }

  return "";
}

function getStartTimeFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const candidate = parsed.searchParams.get("t")
    || parsed.searchParams.get("start")
    || "";

  return parseTimeToSeconds(candidate);
}

function buildYoutubeEmbedClipUrl(videoId, start, clipLengthSeconds) {
  const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
  embed.searchParams.set("rel", "0");
  embed.searchParams.set("start", String(start));
  embed.searchParams.set("end", String(start + clipLengthSeconds));
  return embed.toString();
}

async function validateYoutubeRemotePlayback(rawUrl) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;

  try {
    const response = await fetch(endpoint, { method: "GET" });

    if (!response.ok) {
      return {
        ok: false,
        message: "This YouTube link is not available for embedding/remote playback. Please choose another timestamp link."
      };
    }

    return { ok: true };
  } catch (_error) {
    return {
      ok: false,
      message: "Could not verify remote playback availability for this YouTube link. Please try again or choose a different link."
    };
  }
}

function updateSourceUI() {
  const selected = sourceType?.value || "file";
  const isEmbed = selected === "embed";

  if (videoFileRow) videoFileRow.classList.toggle("hidden", isEmbed);
  if (embedFields) embedFields.classList.toggle("hidden", !isEmbed);
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
    const source = sourceType?.value || "file";
    const file = document.getElementById("videoFile")?.files?.[0];
    const embedUrlInput = document.getElementById("embedUrl")?.value.trim();
    const clipLengthInput = document.getElementById("clipLength")?.value;
    const copyrightConfirmed = document.getElementById("copyrightConfirm")?.checked;

    if (!name || !type || !startPosition || !endPosition || !difficulty) {
      setElementText(status, "Please fill all required fields.");
      return;
    }

    if (!copyrightConfirmed) {
      setElementText(status, "Please confirm you have rights to upload this video.");
      return;
    }

    let mediaUrl = "";

    if (source === "embed") {
      if (!embedUrlInput) {
        setElementText(status, "Please paste a YouTube timestamp URL.");
        return;
      }

      let videoId = "";
      let startSeconds = null;

      try {
        videoId = getYoutubeVideoId(embedUrlInput);
        startSeconds = getStartTimeFromUrl(embedUrlInput);
      } catch (_error) {
        setElementText(status, "Invalid URL. Please paste a full YouTube timestamp link.");
        return;
      }

      if (!videoId) {
        setElementText(status, "Please provide a valid YouTube link.");
        return;
      }

      if (!Number.isFinite(startSeconds) || startSeconds < 0) {
        setElementText(status, "Timestamp link required: include a start time (for example `&t=35s`).");
        return;
      }

      const clipLengthSeconds = Number(clipLengthInput);

      if (!Number.isInteger(clipLengthSeconds)
        || clipLengthSeconds < 1
        || clipLengthSeconds > MAX_EMBED_CLIP_LENGTH_SECONDS) {
        setElementText(status, "Clip length must be a whole number between 1 and 10 seconds.");
        return;
      }

      setElementText(status, "Checking remote playback availability...");
      const availability = await validateYoutubeRemotePlayback(embedUrlInput);
      if (!availability.ok) {
        setElementText(status, availability.message);
        return;
      }

      mediaUrl = buildYoutubeEmbedClipUrl(videoId, startSeconds, clipLengthSeconds);
      setElementText(status, "Saving embedded move to database...");
    } else {
      if (!file) {
        setElementText(status, "Please select a video file.");
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setElementText(status, "Upload blocked: video file must be 10 MB or smaller.");
        return;
      }

      let clipDuration;

      try {
        clipDuration = await getVideoDuration(file);
      } catch (error) {
        setElementText(status, error.message || "Could not validate video length.");
        return;
      }

      if (!Number.isFinite(clipDuration) || clipDuration <= 0) {
        setElementText(status, "Upload blocked: invalid video length.");
        return;
      }

      if (clipDuration > MAX_CLIP_LENGTH_SECONDS) {
        setElementText(status, "Upload blocked: video must be 15 seconds or shorter.");
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

      mediaUrl = publicData.publicUrl;
      setElementText(status, "Saving move to database...");
    }

    const payload = {
      name,
      type,
      start_position: startPosition,
      end_position: endPosition,
      difficulty,
      video_url: mediaUrl,
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
        video_url: mediaUrl,
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

    setElementText(status, source === "embed" ? "Embedded move added successfully!" : "Move added successfully!");
  });
}

if (sourceType) {
  sourceType.addEventListener("change", updateSourceUI);
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

updateSourceUI();
refreshAuthState();