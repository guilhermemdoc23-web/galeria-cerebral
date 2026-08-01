
const DB_NAME="GaleriaCerebralAdmin";
const DB_VERSION=1;
const STORE_NAME="project";
const PROJECT_KEY="current";
const clone=value=>JSON.parse(JSON.stringify(value));
const $=selector=>document.querySelector(selector);

let data=clone(ORIGINAL_DATA);
let author=clone(ORIGINAL_AUTHOR);

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME)){
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function loadProject(){
  try{
    const db=await openDB();
    const saved=await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readonly");
      const request=tx.objectStore(STORE_NAME).get(PROJECT_KEY);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    if(saved){
      data=saved.gallery||clone(ORIGINAL_DATA);
      author=saved.author||clone(ORIGINAL_AUTHOR);
    }
  }catch(error){
    console.warn("Não foi possível carregar o projeto salvo.",error);
  }

  // Remove versões antigas que causavam falso conflito e limite de espaço.
  localStorage.removeItem("galeria-cerebral-neon-final-v1");
  localStorage.removeItem("galeria-cerebral-completa-final-v1");
  localStorage.removeItem("galeria-cerebral-final-admin-v1");
  localStorage.removeItem("galeria-cerebral-arquivo-unico-admin-v1");

  render();
  renderAuthorAdmin();
}

async function persist(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).put({gallery:data,author},PROJECT_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

async function save(){
  try{
    await persist();
    render();
    renderAuthorAdmin();
  }catch(error){
    console.error(error);
    alert("Não foi possível salvar. Tente usar uma imagem menor.");
    throw error;
  }
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function render(){
  $("#roomList").innerHTML=data.rooms.map((room,index)=>`
    <article class="card">
      <div>
        <span class="meta">${esc(room.tag)}</span>
        <h3>${esc(room.title)}</h3>
        <p>${esc(room.description)}</p>
      </div>
      <div class="row-actions">
        <button type="button" data-edit-room="${index}">Editar</button>
        <button type="button" class="danger" data-delete-room="${index}">Excluir</button>
      </div>
    </article>
  `).join("");

  $("#artList").innerHTML=data.artworks.map((art,index)=>`
    <article class="art-row">
      <img class="thumb" src="${art.image}" alt="">
      <div>
        <span class="meta">${esc(data.rooms.find(room=>room.id===art.roomId)?.title||art.roomId)}</span>
        <h3>${esc(art.title)}</h3>
        <p>${esc(art.caption)}</p>
      </div>
      <div class="row-actions">
        <button type="button" data-edit-art="${index}">Editar</button>
        <button type="button" class="danger" data-delete-art="${index}">Excluir</button>
      </div>
    </article>
  `).join("");

  $("#artForm select[name=roomId]").innerHTML=data.rooms
    .map(room=>`<option value="${esc(room.id)}">${esc(room.title)}</option>`)
    .join("");

  renderEditor();
}

function renderEditor(){
  const layer=$("#editorNodes");
  layer.innerHTML="";

  data.rooms.forEach((room,index)=>{
    const node=document.createElement("button");
    node.type="button";
    node.className="editor-room";
    node.style.left=`${room.x/12}%`;
    node.style.top=`${room.y/7.6}%`;
    node.style.setProperty("--c",room.color);
    node.textContent=room.title;
    node.ondblclick=()=>openRoom(index);
    enableDrag(node,room);
    layer.appendChild(node);
  });
}

function enableDrag(node,room){
  let dragging=false;

  node.onpointerdown=event=>{
    dragging=true;
    node.classList.add("dragging");
    node.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  node.onpointermove=event=>{
    if(dragging)updatePosition(event,node,room,false);
  };

  node.onpointerup=async event=>{
    if(!dragging)return;
    dragging=false;
    node.classList.remove("dragging");
    updatePosition(event,node,room,true);
    await persist();
  };
}

function updatePosition(event,node,room,commit){
  const rect=$("#brainEditor").getBoundingClientRect();

  room.x=Math.round(
    Math.max(90,Math.min(1110,((event.clientX-rect.left)/rect.width)*1200))
  );
  room.y=Math.round(
    Math.max(65,Math.min(695,((event.clientY-rect.top)/rect.height)*760))
  );

  node.style.left=`${room.x/12}%`;
  node.style.top=`${room.y/7.6}%`;
  $("#positionStatus").textContent=`${room.title}: X ${room.x} • Y ${room.y}`;

  if(commit){
    $("#positionStatus").textContent=`${room.title} reposicionada ✓`;
  }
}

function uniqueRoomId(base,indexToIgnore=-1){
  let id=(base||"nova-sala")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"");

  if(!id)id="nova-sala";

  const used=new Set(
    data.rooms
      .map((room,index)=>index===indexToIgnore?null:room.id)
      .filter(Boolean)
  );

  if(!used.has(id))return id;

  let number=2;
  while(used.has(`${id}-${number}`))number++;
  return `${id}-${number}`;
}

function openRoom(index=null){
  const form=$("#roomForm");
  form.reset();
  form.index.value=index===null?"":index;

  if(index===null){
    $("#roomDialogTitle").textContent="Nova sala";
    $("#saveRoomButton").textContent="Adicionar sala";
    form.id.value="";
    form.tag.value=`SALA ${String(data.rooms.length+1).padStart(2,"0")}`;
    form.color.value="#7a67ff";
    form.x.value=600;
    form.y.value=370;
  }else{
    $("#roomDialogTitle").textContent="Editar sala";
    $("#saveRoomButton").textContent="Salvar alterações";
    const room=data.rooms[index];
    ["id","title","tag","description","color","x","y"]
      .forEach(key=>form[key].value=room[key]??"");
  }

  $("#roomDialog").showModal();
}

function openArt(index=null){
  const form=$("#artForm");
  form.reset();
  form.index.value=index===null?"":index;
  $("#artPreview").removeAttribute("src");

  if(index===null){
    $("#artDialogTitle").textContent="Nova obra";
    $("#saveArtButton").textContent="Adicionar obra";
  }else{
    $("#artDialogTitle").textContent="Editar obra";
    $("#saveArtButton").textContent="Salvar alterações";
    const art=data.artworks[index];
    form.roomId.value=art.roomId;
    form.title.value=art.title;
    form.caption.value=art.caption;
    $("#artPreview").src=art.image;
  }

  $("#artDialog").showModal();
}

function fileData(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

$("#newRoom").addEventListener("click",()=>openRoom());
$("#newArt").addEventListener("click",()=>openArt());

document.addEventListener("click",async event=>{
  const target=event.target;

  if(target.dataset.close){
    $("#"+target.dataset.close).close();
  }

  if(target.dataset.editRoom!==undefined){
    openRoom(Number(target.dataset.editRoom));
  }

  if(target.dataset.editArt!==undefined){
    openArt(Number(target.dataset.editArt));
  }

  if(target.dataset.deleteRoom!==undefined){
    const index=Number(target.dataset.deleteRoom);
    const room=data.rooms[index];

    if(data.artworks.some(art=>art.roomId===room.id)){
      alert("Esta sala ainda possui obras. Mova ou exclua as obras primeiro.");
      return;
    }

    if(confirm(`Excluir “${room.title}”?`)){
      data.rooms.splice(index,1);
      await save();
    }
  }

  if(target.dataset.deleteArt!==undefined){
    const index=Number(target.dataset.deleteArt);

    if(confirm(`Excluir “${data.artworks[index].title}”?`)){
      data.artworks.splice(index,1);
      await save();
    }
  }
});

$("#roomForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const form=event.currentTarget;
  const index=form.index.value===""?-1:Number(form.index.value);
  const title=form.title.value.trim();

  if(!title){
    alert("Digite o nome da sala.");
    return;
  }

  const requestedId=form.id.value.trim()||title;
  const room={
    id:uniqueRoomId(requestedId,index),
    title,
    tag:form.tag.value.trim()||`SALA ${String(data.rooms.length+1).padStart(2,"0")}`,
    description:form.description.value.trim(),
    color:form.color.value||"#7a67ff",
    x:Number(form.x.value||600),
    y:Number(form.y.value||370)
  };

  if(index>=0){
    const oldId=data.rooms[index].id;
    data.rooms[index]=room;

    if(oldId!==room.id){
      data.artworks.forEach(art=>{
        if(art.roomId===oldId)art.roomId=room.id;
      });
    }
  }else{
    data.rooms.push(room);
  }

  await save();
  $("#roomDialog").close();
});

$("#artForm").addEventListener("submit",async event=>{
  event.preventDefault();

  const form=event.currentTarget;
  const index=form.index.value===""?-1:Number(form.index.value);
  const file=$("#imageFile").files[0];
  const button=$("#saveArtButton");

  button.disabled=true;
  button.textContent="Salvando...";

  try{
    let image=index>=0?data.artworks[index].image:"";

    if(file){
      image=await fileData(file);
    }

    const artwork={
      roomId:form.roomId.value,
      title:form.title.value.trim(),
      caption:form.caption.value.trim(),
      image
    };

    if(!artwork.roomId){
      alert("Escolha uma sala.");
      return;
    }

    if(!artwork.title){
      alert("Digite o título da obra.");
      return;
    }

    if(!artwork.image){
      alert("Escolha uma imagem.");
      return;
    }

    if(index>=0){
      data.artworks[index]=artwork;
    }else{
      data.artworks.push(artwork);
    }

    await save();
    $("#artDialog").close();
  }finally{
    button.disabled=false;
    button.textContent=index>=0?"Salvar alterações":"Adicionar obra";
  }
});

$("#imageFile").addEventListener("change",async event=>{
  const file=event.target.files[0];
  if(file){
    $("#artPreview").src=await fileData(file);
  }
});

function renderAuthorAdmin(){
  $("#authorButtonLabel").value=author.buttonLabel||"Sobre o Autor";
  $("#authorKickerInput").value=author.kicker||"SOBRE O AUTOR";
  $("#authorNameInput").value=author.name||"";
  $("#authorRoleInput").value=author.role||"";
  $("#authorTextInput").value=(author.paragraphs||[]).join("\n\n");
  $("#authorTagsInput").value=(author.tags||[]).join(", ");
  $("#authorInstagramInput").value=author.instagram||"@solunmix";
  $("#authorInstagramUrlInput").value=author.instagramUrl||"https://www.instagram.com/solunmix/";
  $("#authorPhotoPreview").src=author.photo||"";
  $("#authorNamePreview").textContent=author.name||"";
  $("#authorRolePreview").textContent=author.role||"";
}

$("#authorPhotoFile").addEventListener("change",async event=>{
  const file=event.target.files[0];
  if(file){
    author.photo=await fileData(file);
    $("#authorPhotoPreview").src=author.photo;
  }
});

$("#saveAuthor").addEventListener("click",async()=>{
  author.buttonLabel=$("#authorButtonLabel").value.trim()||"Sobre o Autor";
  author.kicker=$("#authorKickerInput").value.trim()||"SOBRE O AUTOR";
  author.name=$("#authorNameInput").value.trim();
  author.role=$("#authorRoleInput").value.trim();
  author.paragraphs=$("#authorTextInput").value
    .split(/\n\s*\n/)
    .map(paragraph=>paragraph.trim())
    .filter(Boolean);
  author.tags=$("#authorTagsInput").value
    .split(",")
    .map(tag=>tag.trim())
    .filter(Boolean);
  author.instagram=$("#authorInstagramInput").value.trim()||"@solunmix";
  author.instagramUrl=$("#authorInstagramUrlInput").value.trim()
    ||"https://www.instagram.com/solunmix/";

  await persist();
  renderAuthorAdmin();
  alert("Apresentação do autor salva.");
});

$("#restore").addEventListener("click",async()=>{
  if(!confirm("Restaurar salas, obras e autor originais?"))return;
  data=clone(ORIGINAL_DATA);
  author=clone(ORIGINAL_AUTHOR);
  await save();
});

$("#exportIndex").addEventListener("click",()=>{
  let html=GALLERY_HTML_TEMPLATE
    .replace("__DATA_JSON__",JSON.stringify(data))
    .replace("__AUTHOR_JSON__",JSON.stringify(author));

  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");

  link.href=url;
  link.download="index.html";
  link.click();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

loadProject();
