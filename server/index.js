import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuid } from "uuid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const FFMPEG_PATH = "C:\\Users\\MSK KHAN\\Downloads\\ffmpeg-8.0.1-full_build\\ffmpeg-8.0.1-full_build\\bin";

const TEMP = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP);

const jobs = {};

function format(sec){
  sec = Number(sec || 0);
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return `${m}:${s<10?"0":""}${s}`;
}

function sizeToMB(str){
  if(!str) return 0;
  const n=parseFloat(str);
  if(str.includes("KiB")) return n/1024;
  if(str.includes("MiB")) return n;
  if(str.includes("GiB")) return n*1024;
  return n;
}

function mbToStr(mb){
  if(!mb) return "0 MB";
  if(mb>1024) return (mb/1024).toFixed(2)+" GB";
  return mb.toFixed(2)+" MB";
}

/* VIDEO INFO */
app.get("/video",(req,res)=>{
  const url=req.query.url;
  const p=spawn("yt-dlp",["-J",url]);

  let data="";
  p.stdout.on("data",d=>data+=d);

  p.on("close",()=>{
    const json=JSON.parse(data);

    const seen=new Set();
    const formats=[];
    json.formats.forEach(f=>{
      if(f.vcodec!=="none" && f.height){
        const q=`${f.height}p`;
        if(!seen.has(q)){
          seen.add(q);
          formats.push({quality:q,format_id:f.format_id});
        }
      }
    });

    res.json({
      title:json.title,
      thumbnail:json.thumbnail,
      duration:format(json.duration),
      rawDuration:json.duration,
      formats
    });
  });
});

/* DOWNLOAD VIDEO */
app.get("/download",(req,res)=>{
  const {url,format_id,title,thumbnail,duration}=req.query;

  const id=uuid();
  const file=path.join(TEMP,`${id}.mp4`);

  jobs[id]={
    progress:0,
    downloaded:"0 MB",
    total:"0 MB",
    title,
    thumbnail,
    duration:format(duration),
    status:"downloading"
  };

  const args=[
    "--newline",
    "--ffmpeg-location",FFMPEG_PATH,
    "-f",`${format_id}+bestaudio`,
    "--merge-output-format","mp4",
    "-o",file,
    url
  ];

  const p=spawn("yt-dlp",args);

  p.stdout.on("data",d=>{
    const line=d.toString();

    const prog=line.match(/(\d+\.?\d*)%/);
    if(prog) jobs[id].progress=parseFloat(prog[1]);

    const tot=line.match(/of\s+([\d\.]+\w+B)/);
    if(tot){
      jobs[id].total=tot[1];
      const totalMB=sizeToMB(tot[1]);
      const done=(totalMB*jobs[id].progress)/100;
      jobs[id].downloaded=mbToStr(done);
    }
  });

  p.on("close",()=>jobs[id].progress=100);

  res.json({jobId:id});
});

/* MP3 */
app.get("/mp3",(req,res)=>{
  const {url,title,thumbnail,duration}=req.query;

  const id=uuid();
  const fileBase=path.join(TEMP,id);

  jobs[id]={
    progress:0,
    downloaded:"0 MB",
    total:"0 MB",
    title,
    thumbnail,
    duration:format(duration),
    status:"downloading"
  };

  const args=[
    "--newline",
    "--ffmpeg-location",FFMPEG_PATH,
    "-x","--audio-format","mp3",
    "-o",`${fileBase}.%(ext)s`,
    url
  ];

  const p=spawn("yt-dlp",args);

  p.stdout.on("data",d=>{
    const line=d.toString();

    const prog=line.match(/(\d+\.?\d*)%/);
    if(prog) jobs[id].progress=parseFloat(prog[1]);

    const tot=line.match(/of\s+([\d\.]+\w+B)/);
    if(tot){
      jobs[id].total=tot[1];
      const totalMB=sizeToMB(tot[1]);
      const done=(totalMB*jobs[id].progress)/100;
      jobs[id].downloaded=mbToStr(done);
    }
  });

  p.on("close",()=>jobs[id].progress=100);

  res.json({jobId:id});
});

/* PROGRESS */
app.get("/progress/:id",(req,res)=>{
  res.json(jobs[req.params.id]||{});
});

/* FILE */
app.get("/file/:id", (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.send("Not ready");

  const fileMp4 = path.join(TEMP, `${req.params.id}.mp4`);
  const fileMp3 = path.join(TEMP, `${req.params.id}.mp3`);

  const file = fs.existsSync(fileMp4) ? fileMp4 : fileMp3;
  if (!fs.existsSync(file)) return res.send("Not ready");

  // sanitize title for filename
  let safeTitle = job.title || "download";
  safeTitle = safeTitle.replace(/[\\/:*?"<>|]/g, "");

  const ext = file.endsWith(".mp3") ? ".mp3" : ".mp4";
  const finalName = safeTitle + ext;

res.download(file, finalName, () => {
  // wait before deleting so browser finishes download
  setTimeout(() => {
    fs.unlink(file, () => {});
    delete jobs[req.params.id];
  }, 13000); // 10 seconds
});

});

/* CANCEL */
app.get("/cancel/:id",(req,res)=>{
  delete jobs[req.params.id];
  res.send("cancelled");
});


/* ===== TEMP FILE CLEANER (optional safety) ===== */
setInterval(()=>{
  fs.readdir(TEMP,(err,files)=>{
    if(err) return;

    files.forEach(f=>{
      const filePath = path.join(TEMP,f);
      fs.stat(filePath,(e,stat)=>{
        if(e) return;

        const age = Date.now() - stat.mtimeMs;

        // delete files older than 1 hour
        if(age > 60 * 60 * 1000){
          fs.unlink(filePath,()=>{});
        }
      });
    });
  });
}, 30 * 60 * 1000); // runs every 30 minutes


app.listen(5000,()=>console.log("SERVER RUNNING 5000"));
