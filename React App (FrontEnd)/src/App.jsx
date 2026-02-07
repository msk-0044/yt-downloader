import { useState } from "react";
import axios from "axios";

export default function App() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchVideo = async () => {
    if (!url) return;
    setLoading(true);

    try {
      const res = await fetch(
        `http://localhost:5000/video?url=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      setVideo(data);
    } catch (err) {
      console.log(err);
      alert("Failed to fetch video");
    }

    setLoading(false);
  };

  const startDownload = async (format_id) => {
    const res = await fetch(
      `http://localhost:5000/download?url=${encodeURIComponent(url)}
    &format_id=${format_id}
    &title=${encodeURIComponent(video.title)}
    &thumbnail=${encodeURIComponent(video.thumbnail)}
    &duration=${video.rawDuration}`,
    );

    const { jobId } = await res.json();
    window.open(`http://localhost:5000/progress.html?job=${jobId}`, "_blank");
  };

  const startMP3 = async () => {
    const res = await fetch(
      `http://localhost:5000/mp3?url=${encodeURIComponent(url)}
    &title=${encodeURIComponent(video.title)}
    &thumbnail=${encodeURIComponent(video.thumbnail)}
    &duration=${video.rawDuration}`,
    );

    const { jobId } = await res.json();
    window.open(`http://localhost:5000/progress.html?job=${jobId}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-gray-900 to-black text-white p-6">
      <h1 className="text-4xl font-bold text-center mb-8">🎬 YT Downloader</h1>

      {/* INPUT */}
      <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
          placeholder="Paste YouTube link & press Enter"
          className="flex-1 px-4 py-3 rounded-lg text-white shadow-lg border border-gray-600 hover:border-gray-600"
        />

        <button
          onClick={fetchVideo}
          className="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-lg shadow-lg"
        >
          Fetch
        </button>
      </div>

      {loading && (
        <p className="text-center mt-6 animate-pulse">Fetching video...</p>
      )}

      {video && (
        <div className="max-w-4xl mx-auto mt-10 bg-white/5 backdrop-blur-lg p-6 rounded-2xl shadow-2xl border border-white/10">
          <div className="flex flex-col md:flex-row gap-6">
            <img
              src={video.thumbnail}
              className="w-full md:w-80 rounded-xl shadow-xl"
            />

            <div className="flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold">{video.title}</h2>
                <p className="text-gray-400 mt-2">Duration: {video.duration}</p>
              </div>

              {/* MP3 */}
              {/*  <a
                href={`http://localhost:5000/mp3?url=${encodeURIComponent(url)}&title=${encodeURIComponent(video.title)}`}
                className="mt-4 bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg text-center"
                target="_blank"              
              >
                🎵 Download MP3
              </a> */}

              <button
                onClick={startMP3}
           className="mt-4 bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg text-center font-semibold"              >
                🎵 Download MP3
              </button>
            </div>
          </div>

          <h3 className="mt-8 mb-4 text-lg font-semibold">Download Video</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {video.formats.map((f, i) => (
              <div
                key={i}
                className=" bg-white/5 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/10 hover:scale-105 transition mx-auto"
              >
                <p className="font-semibold text-center mb-3">{f.quality}</p>
                {/* 
                <a
                  href={`http://localhost:5000/download?url=${encodeURIComponent(url)}&format_id=${f.format_id}&title=${encodeURIComponent(video.title)}`}
                  className="block bg-blue-500 py-3 rounded text-center"
                  target="_blank"
                >
                  Download MP4
                </a> */}

                <button
                  onClick={() => startDownload(f.format_id)}
                  className="block bg-blue-500 py-3 px-3 rounded-lg text-center"
                >
                  Download MP4
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-gray-500 mt-12 text-sm">
        React + Node Downloader
      </p>
    </div>
  );
}
