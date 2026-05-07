import { useSvgFile } from "./hooks/useSvgFile";
import { useSidecarConfig } from "./hooks/useSidecarConfig";
import { SvgViewport } from "./components/SvgViewport";
import "./App.css";

function App() {
  const { svgFile, error, pickFile } = useSvgFile();
  useSidecarConfig(svgFile?.path ?? null);

  return (
    <main className="app">
      {!svgFile ? (
        <div className="empty-state">
          <h1>Presentator</h1>
          <button onClick={pickFile}>Open SVG file</button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <SvgViewport content={svgFile.content} />
      )}
    </main>
  );
}

export default App;
