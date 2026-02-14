const uploadBtn = document.getElementById("uploadBtn");
const logoutBtn = document.getElementById("logoutBtn");
const status = document.getElementById("status");

async function requireLogin() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    alert("You must be logged in to upload.");
    window.location.href = "index.html";
  }

  return user;
}

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

uploadBtn.addEventListener("click", async () => {

  const user = await requireLogin();

  const title = document.getElementById("title").value;
  const file = document.getElementById("videoFile").files[0];
  const agree = document.getElementById("copyrightAgree").checked;

  if (!title || !file) {
    status.innerText = "Title and file required.";
    return;
  }

  if (!agree) {
    status.innerText = "You must confirm upload rights.";
    return;
  }

  const fileName = `${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("videos")
    .upload(fileName, file);

  if (uploadError) {
    status.innerText = uploadError.message;
    return;
  }

  const { data: publicUrl } = supabaseClient
    .storage
    .from("videos")
    .getPublicUrl(fileName);

  const { error: dbError } = await supabaseClient
    .from("videos")
    .insert([
      {
        title: title,
        url: publicUrl.publicUrl,
        uploader_id: user.id
      }
    ]);

  if (dbError) {
    status.innerText = dbError.message;
    return;
  }

  status.innerText = "Upload successful.";
});
