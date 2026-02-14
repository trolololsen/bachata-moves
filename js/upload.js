const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const uploadBtn = document.getElementById("uploadBtn");
const status = document.getElementById("status");

async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  }
  return user;
}

loginBtn.addEventListener("click", async () => {
  const email = prompt("Enter your email:");
  if (!email) return;
  await supabaseClient.auth.signInWithOtp({ email });
  alert("Check your email for login link.");
});

logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

async function requireLogin() {
  const user = await checkUser();
  if (!user) {
    alert("You must login to upload.");
    return null;
  }
  return user;
}

uploadBtn.addEventListener("click", async () => {
  const user = await requireLogin();
  if (!user) return;

  const title = document.getElementById("title").value;
  const file = document.getElementById("videoFile").files[0];
  const agree = document.getElementById("copyrightAgree").checked;

  if (!title || !file) { status.innerText = "Title and file required."; return; }
  if (!agree) { status.innerText = "You must confirm upload rights."; return; }

  const fileName = `${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("videos")
    .upload(fileName, file);

  if (uploadError) {
    status.innerText = "Upload failed: " + uploadError.message;
    return;
  }

  const { data: publicUrl } = supabaseClient
    .storage
    .from("videos")
    .getPublicUrl(fileName);

  const { error: dbError } = await supabaseClient
    .from("moves")
    .insert([{
      name: title,
      video_url: publicUrl.publicUrl,
      uploader_id: user.id
    }]);

  if (dbError) {
    status.innerText = "DB insert failed: " + dbError.message;
    return;
  }

  status.innerText = "Upload successful!";
  document.getElementById("title").value = "";
  document.getElementById("videoFile").value = "";
  document.getElementById("copyrightAgree").checked = false;
});
