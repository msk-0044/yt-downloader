import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { fileURLToPath } from "url";
import ytdlp from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const FFMPEG_PATH = ffmpegPath;
const COOKIE_PATH = path.join(__dirname, "cookies.txt"); // ⭐ cookies

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

////////////////////////////////////////////////////////////
//////////////////// VIDEO INFO ////////////////////////////
////////////////////////////////////////////////////////////

app.get("/video", async (req, res) => {
  try {
    const url = req.query.url;

    const json = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,

      cookies: "./cookies.txt",

      extractorArgs: "youtube:player_client=android",

      addHeader: [
        "user-agent:Mozilla/5.0",
        "accept-language:en-US,en;q=0.9"
      ]
    });

    const seen = new Set();
    const formats = [];

    json.formats.forEach(f => {
      if (f.vcodec !== "none" && f.height) {
        const q = `${f.height}p`;
        if (!seen.has(q)) {
          seen.add(q);
          formats.push({ quality: q, format_id: f.format_id });
        }
      }
    });

    res.json({
      title: json.title,
      thumbnail: json.thumbnail,
      duration: format(json.duration),
      rawDuration: json.duration,
      formats
    });

  } catch (e) {
    console.log("VIDEO ERROR:", e.stderr || e);
    res.status(500).send("Failed to fetch video info");
  }
});


////////////////////////////////////////////////////////////
//////////////////// DOWNLOAD //////////////////////////////
////////////////////////////////////////////////////////////

app.get("/download", async (req, res) => {
  const { url, format_id, title, thumbnail, duration } = req.query;

  const id = uuid();
  const file = path.join(TEMP, `${id}.mp4`);

  jobs[id] = {
    progress: 0,
    downloaded: "0 MB",
    total: "0 MB",
    title,
    thumbnail,
    duration: format(duration),
    status: "downloading"
  };

  const process = ytdlp.exec(url, {
    format: `${format_id}+bestaudio`,
    mergeOutputFormat: "mp4",
    output: file,
    ffmpegLocation: FFMPEG_PATH,
    cookies: COOKIE_PATH   // ⭐
  });

  process.stdout.on("data", d => {
    const line = d.toString();

    const prog = line.match(/(\d+\.?\d*)%/);
    if (prog) jobs[id].progress = parseFloat(prog[1]);

    const tot = line.match(/of\s+([\d\.]+\w+B)/);
    if (tot) {
      jobs[id].total = tot[1];
      const totalMB = sizeToMB(tot[1]);
      const done = (totalMB * jobs[id].progress) / 100;
      jobs[id].downloaded = mbToStr(done);
    }
  });

  process.on("close", () => {
    jobs[id].progress = 100;
  });

  res.json({ jobId: id });
});

////////////////////////////////////////////////////////////
//////////////////// MP3 //////////////////////////////////
////////////////////////////////////////////////////////////

app.get("/mp3", async (req, res) => {
  const { url, title, thumbnail, duration } = req.query;

  const id = uuid();
  const fileBase = path.join(TEMP, id);

  jobs[id] = {
    progress: 0,
    downloaded: "0 MB",
    total: "0 MB",
    title,
    thumbnail,
    duration: format(duration),
    status: "downloading"
  };

  const process = ytdlp.exec(url, {
    extractAudio: true,
    audioFormat: "mp3",
    output: `${fileBase}.%(ext)s`,
    ffmpegLocation: FFMPEG_PATH,
    cookies: COOKIE_PATH   // ⭐
  });

  process.stdout.on("data", d => {
    const line = d.toString();

    const prog = line.match(/(\d+\.?\d*)%/);
    if (prog) jobs[id].progress = parseFloat(prog[1]);

    const tot = line.match(/of\s+([\d\.]+\w+B)/);
    if (tot) {
      jobs[id].total = tot[1];
      const totalMB = sizeToMB(tot[1]);
      const done = (totalMB * jobs[id].progress) / 100;
      jobs[id].downloaded = mbToStr(done);
    }
  });

  process.on("close", () => {
    jobs[id].progress = 100;
  });

  res.json({ jobId: id });
});

////////////////////////////////////////////////////////////

app.get("/progress/:id",(req,res)=>{
  res.json(jobs[req.params.id]||{});
});

app.get("/file/:id",(req,res)=>{
  const job=jobs[req.params.id];
  if(!job) return res.send("Not ready");

  const fileMp4=path.join(TEMP,`${req.params.id}.mp4`);
  const fileMp3=path.join(TEMP,`${req.params.id}.mp3`);

  const file=fs.existsSync(fileMp4)?fileMp4:fileMp3;
  if(!fs.existsSync(file)) return res.send("Not ready");

  let safeTitle=job.title||"download";
  safeTitle=safeTitle.replace(/[\\/:*?"<>|]/g,"");

  const ext=file.endsWith(".mp3")?".mp3":".mp4";
  const finalName=safeTitle+ext;

  res.download(file,finalName,()=>{
    setTimeout(()=>{
      fs.unlink(file,()=>{});
      delete jobs[req.params.id];
    },15000);
  });
});

////////////////////////////////////////////////////////////

const PORT=process.env.PORT||5000;
app.listen(PORT,()=>console.log("SERVER RUNNING"));
