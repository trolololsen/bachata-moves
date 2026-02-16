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

function getYoutubeEmbedUrl(rawUrl, manualStart, manualEnd) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname;

    let videoId = "";

    if (host === "youtu.be") {
      videoId = path.replace("/", "").split("/")[0];
    } else if (host.endsWith("youtube.com")) {
      if (path === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (path.startsWith("/shorts/")) {
        videoId = path.split("/")[2] || "";
      } else if (path.startsWith("/embed/")) {
        videoId = path.split("/")[2] || "";
      }
    }

    if (!videoId) {
      return { error: "Please provide a valid YouTube video link." };
    }

    const startFromLink = parseTimeToSeconds(parsed.searchParams.get("t") || "")
      || parseTimeToSeconds(parsed.searchParams.get("start") || "");
    const endFromLink = parseTimeToSeconds(parsed.searchParams.get("end") || "");

    const start = Number.isFinite(manualStart) ? manualStart : startFromLink;
    const end = Number.isFinite(manualEnd) ? manualEnd : endFromLink;

    if (Number.isFinite(start) && start < 0) {
      return { error: "Start time cannot be negative." };
    }

    if (Number.isFinite(end) && end <= 0) {
      return { error: "End time must be greater than zero." };
    }

    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      return { error: "End time must be greater than start time." };
    }

    const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
    embed.searchParams.set("rel", "0");

    if (Number.isFinite(start)) {
      embed.searchParams.set("start", String(start));
    }

    if (Number.isFinite(end)) {
      embed.searchParams.set("end", String(end));
    }

    return { embedUrl: embed.toString() };
  } catch (_error) {
    return { error: "Invalid URL. Please paste a full YouTube link." };
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
    const embedStart = document.getElementById("embedStart")?.value;
    const embedEnd = document.getElementById("embedEnd")?.value;
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
        setElementText(status, "Please paste a YouTube URL for embedded source.");
        return;
      }

      const manualStart = embedStart === "" ? null : Number(embedStart);
      const manualEnd = embedEnd === "" ? null : Number(embedEnd);

      if ((embedStart !== "" && (!Number.isFinite(manualStart) || manualStart < 0))
        || (embedEnd !== "" && (!Number.isFinite(manualEnd) || manualEnd <= 0))) {
        setElementText(status, "Start/end must be valid positive numbers.");
        return;
      }

      const parsed = getYoutubeEmbedUrl(embedUrlInput, manualStart, manualEnd);
      if (parsed.error) {
        setElementText(status, parsed.error);
        return;
      }

      mediaUrl = parsed.embedUrl;
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