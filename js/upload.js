document.getElementById("uploadBtn").addEventListener("click", async () => {

  const status = document.getElementById("status");

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
