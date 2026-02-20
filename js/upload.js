const uploadAccessMessage = document.getElementById("uploadAccessMessage");
const uploadFormSection = document.getElementById("uploadFormSection");
const editModeNotice = document.getElementById("editModeNotice");
const uploadTitle = document.getElementById("uploadTitle");
const authUserInfo = document.getElementById("authUserInfo");
const signOutBtn = document.getElementById("signOutBtn");
const status = document.getElementById("status");
const uploadBtn = document.getElementById("uploadBtn");
const sourceType = document.getElementById("sourceType");
const videoFileRow = document.getElementById("videoFileRow");
const embedFields = document.getElementById("embedFields");

const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_STANDARD_CLIP_LENGTH_SECONDS = 15;
const MAX_INSTRUCTIONS_CLIP_LENGTH_SECONDS = 60;

const editMoveId = new URLSearchParams(window.location.search).get("edit");

let currentUser = null;
let currentTier = "basic";
let editingMove = null;

function setElementText(el, text) {
  if (el) el.textContent = text;
}

function normalizeTier(value) {
  const tier = (value || "").toString().toLowerCase();
  if (["pro", "premium"].includes(tier)) return "pro";
  if (["normal", "plus", "standard"].includes(tier)) return "normal";
  return "basic";
}

function normalizeType(value) {
  const type = (value || "").toString().trim().toLowerCase();
  if (["entry", "exit", "transition", "position change"].includes(type)) return "Position Change";
  if (type === "footwork") return "Footwork";
  if (type === "styling") return "Styling";
  if (type === "combo") return "Combo";
  if (type === "instructions" || type === "instruction") return "Instructions";
  if (type === "position variation") return "Position Variation";
  return "Move";
}

function getMaxClipLengthSeconds(type) {
  return type === "Instructions" ? MAX_INSTRUCTIONS_CLIP_LENGTH_SECONDS : MAX_STANDARD_CLIP_LENGTH_SECONDS;
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test((url || "").trim());
}

function updateClipLengthConstraints() {
  const type = normalizeType(document.getElementById("type")?.value);
  const maxLength = getMaxClipLengthSeconds(type);
  const clipInput = document.getElementById("clipLength");
  if (!clipInput) return;

  clipInput.max = String(maxLength);
  const current = Number(clipInput.value || "0");
  if (!Number.isFinite(current) || current < 1) {
    clipInput.value = String(Math.min(8, maxLength));
  } else if (current > maxLength) {
    clipInput.value = String(maxLength);
  }
}

function isEmbeddedYoutubeUrl(url) {
  return /^https:\/\/(www\.)?youtube\.com\/embed\//i.test((url || "").trim());
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
  if (/^\d+$/.test(value)) return Number(value);

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

  if (host === "youtu.be") return path.replace("/", "").split("/")[0] || "";
  if (!host.endsWith("youtube.com")) return "";
  if (path === "/watch") return parsed.searchParams.get("v") || "";
  if (path.startsWith("/shorts/") || path.startsWith("/embed/")) return path.split("/")[2] || "";

  return "";
}

function getStartTimeFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const candidate = parsed.searchParams.get("t") || parsed.searchParams.get("start") || "";
  return parseTimeToSeconds(candidate);
}

function buildYoutubeEmbedClipUrl(videoId, start, clipLengthSeconds) {
  const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
  embed.searchParams.set("rel", "0");
  embed.searchParams.set("start", String(start));
  embed.searchParams.set("end", String(start + clipLengthSeconds));
  return embed.toString();
}

function getTimestampUrlFromEmbed(embedUrl) {
  try {
    const parsed = new URL(embedUrl);
    const videoId = parsed.pathname.split("/").pop() || "";
    const start = Number(parsed.searchParams.get("start") || "0");
    if (!videoId) return "";
    return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, start)}s`;
  } catch (_error) {
    return "";
  }
}

function getClipLengthFromEmbed(embedUrl) {
  try {
    const parsed = new URL(embedUrl);
    const start = Number(parsed.searchParams.get("start") || "0");
    const end = Number(parsed.searchParams.get("end") || "0");
    const length = end - start;
    if (!Number.isFinite(length) || length <= 0) return 8;
    return Math.max(1, Math.round(length));
  } catch (_error) {
    return 8;
  }
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
  const isImage = selected === "image";

  if (videoFileRow) {
    videoFileRow.classList.toggle("hidden", isEmbed);
    const fileInput = document.getElementById("videoFile");
    const fileLabel = document.querySelector('label[for="videoFile"]');

    if (fileInput) fileInput.accept = isImage ? "image/*" : "video/*";
    if (fileLabel) fileLabel.textContent = isImage ? "Image" : "Video";
  }

  if (embedFields) embedFields.classList.toggle("hidden", !isEmbed);
  updateClipLengthConstraints();
}

function setEditModeUI() {
  if (!editMoveId) return;
  setElementText(uploadTitle, "Edit Move");
  if (uploadBtn) uploadBtn.textContent = "Save Changes";
  setElementText(editModeNotice, "Edit mode: update all fields, then save.");
  if (editModeNotice) editModeNotice.classList.remove("hidden");
}

async function loadMoveForEditing() {
  if (!editMoveId) return;

  const { data, error } = await supabaseClient
    .from("moves")
    .select("*")
    .eq("id", editMoveId)
    .maybeSingle();

  if (error || !data) {
    setElementText(status, error ? `Could not load move: ${error.message}` : "Move not found.");
    return;
  }

  editingMove = data;

  document.getElementById("name").value = data.name || "";
  document.getElementById("type").value = normalizeType(data.type);
  document.getElementById("start_position").value = data.start_position || "";
  document.getElementById("end_position").value = data.end_position || "";
  document.getElementById("difficulty").value = data.difficulty || "";
  document.getElementById("comment").value = data.comment || "";
  document.getElementById("privateMove").checked = Boolean(data.is_private);
  document.getElementById("copyrightConfirm").checked = true;

  if (isEmbeddedYoutubeUrl(data.video_url || "")) {
    sourceType.value = "embed";
    document.getElementById("embedUrl").value = getTimestampUrlFromEmbed(data.video_url);
    document.getElementById("clipLength").value = String(getClipLengthFromEmbed(data.video_url));
  } else if (isImageUrl(data.video_url || "")) {
    sourceType.value = "image";
  } else {
    sourceType.value = "file";
  }

  updateSourceUI();
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

  if (!error && data?.tier) return normalizeTier(data.tier);

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

  if (currentUser && currentTier === "pro" && editMoveId) {
    await loadMoveForEditing();
  }
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
    const isPrivate = Boolean(document.getElementById("privateMove")?.checked);
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

    const maxClipLengthSeconds = getMaxClipLengthSeconds(type);

    let mediaUrl = editingMove?.video_url || "";
    if (type === "Position Variation" && source !== "image") {
      setElementText(status, "Position Variation entries must use image upload source.");
      return;
    }


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
      if (!Number.isInteger(clipLengthSeconds) || clipLengthSeconds < 1 || clipLengthSeconds > maxClipLengthSeconds) {
        setElementText(status, `Clip length must be a whole number between 1 and ${maxClipLengthSeconds} seconds.`);
        return;
      }

      setElementText(status, "Checking remote playback availability...");
      const availability = await validateYoutubeRemotePlayback(embedUrlInput);
      if (!availability.ok) {
        setElementText(status, availability.message);
        return;
      }

      mediaUrl = buildYoutubeEmbedClipUrl(videoId, startSeconds, clipLengthSeconds);
      setElementText(status, editMoveId ? "Saving move changes..." : "Saving embedded move to database...");
    } else {
      if (!file && !editMoveId) {
        setElementText(status, source === "image" ? "Please select an image file." : "Please select a video file.");
        return;
      }

      if (file) {
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          setElementText(status, "Upload blocked: file must be 15 MB or smaller.");
          return;
        }

        if (source !== "image") {
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

          if (clipDuration > maxClipLengthSeconds) {
            setElementText(status, `Upload blocked: ${type} must be ${maxClipLengthSeconds} seconds or shorter.`);
            return;
          }
        }

        setElementText(status, source === "image" ? "Uploading image..." : "Uploading video...");

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
      }

      if (!mediaUrl) {
        setElementText(status, "No video source available for this move.");
        return;
      }

      setElementText(status, editMoveId ? "Saving move changes..." : "Saving move to database...");
    }

    const payload = {
      name,
      type,
      start_position: startPosition,
      end_position: endPosition,
      difficulty,
      video_url: mediaUrl,
      comment,
      is_private: isPrivate,
      uploader_id: currentUser?.id,
      uploader_email: currentUser?.email
    };

    if (editMoveId) {
      const { error: updateError } = await supabaseClient
        .from("moves")
        .update(payload)
        .eq("id", editMoveId);

      if (updateError) {
        setElementText(status, `Update failed: ${updateError.message}`);
        return;
      }

      setElementText(status, "Move updated successfully!");
      return;
    }

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

document.getElementById("type")?.addEventListener("change", updateClipLengthConstraints);

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setElementText(uploadAccessMessage, error.message);
  });
}

supabaseClient.auth.onAuthStateChange(() => {
  refreshAuthState();
});

setEditModeUI();
updateSourceUI();
updateClipLengthConstraints();
refreshAuthState();