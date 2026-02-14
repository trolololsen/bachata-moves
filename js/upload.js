const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const uploadBtn = document.getElementById("uploadBtn");
const status = document.getElementById("status");

const startPositionUpload = document.getElementById("startPositionUpload");
const endPositionUpload = document.getElementById("endPositionUpload");

const positions = [
  "open", "closed", "side-by-side", "cross-body", "underarm-turn",
  "inside-turn", "outside-turn", "cuddle", "shadow", "promenade",
  "fan", "back-spot", "slot", "line", "tango-close", "hammerlock",
  "spiral", "wrap", "body-wave", "other"
];

// Populate positions
positions.forEach(p => {
  const o1 = document.createElement("option"); o1.value=p;o1.text=p; startPositionUpload.appendChild(o1);
  const o2 = document.createElement("option"); o2.value=p;o2.text=p; endPositionUpload.appendChild(o2);
});

async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if(user){
    loginBtn.style.display="none"; logoutBtn.style.display="inline-block";
  } else {
    loginBtn.style.display="inline-block"; logoutBtn.style.display="none";
  }
  return user;
}

loginBtn.addEventListener("click", async () => {
  const email = prompt("Enter your email:");
  if(!email) return;
  await supabaseClient.auth.signInWithOtp({email});
  alert("Check your email for login link.");
});

logoutBtn.addEventListener("click", async ()=>{
  await supabaseClient.auth.signOut();
  location.reload();
});

uploadBtn.addEventListener("click", async ()=>{
  const user = await checkUser();
  if(!user){ alert("You must login to upload."); return; }

  const title = document.getElementById("title").value;
  const file = document.getElementById("videoFile").files[0];
  const type = document.getElementById("moveTypeUpload").value;
  const difficulty = document.getElementById("difficultyUpload").value;
  const comment = document.getElementById("commentUpload").value;
  const start = startPositionUpload.value;
  const end = endPositionUpload.value;
  const agree = document.getElementById("copyrightAgree").checked;

  if(!title||!file){status.innerText="Title and file required."; return;}
  if(!agree){status.innerText="You must confirm upload rights."; return;}

  const fileName = `${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabaseClient
    .storage.from("videos").upload(fileName, file);

  if(uploadError){status.innerText="Upload failed: "+uploadError.message; return;}

  const { data: publicUrl } = supabaseClient
    .storage.from("videos").getPublicUrl(fileName);

  const { error: dbError } = await supabaseClient
    .from("moves").insert([{
      name:title,
      type:type,
      difficulty:difficulty,
      comment:comment,
      start_position:start,
      end_position:end,
      video_url:publicUrl.publicUrl,
      uploader_id:user.id
    }]);

  if(dbError){status.innerText="DB insert failed: "+dbError.message; return;}

  status.innerText="Upload successful!";
  document.getElementById("title").value="";
  document.getElementById("videoFile").value="";
  document.getElementById("commentUpload").value="";
  document.getElementById("copyrightAgree").checked=false;
});
