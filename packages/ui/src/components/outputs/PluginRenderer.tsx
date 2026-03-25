import { useState, useEffect } from "react";

interface Props {
  pluginType: string;
  data: Record<string, unknown>;
}

export function PluginRenderer({ pluginType, data }: Props) {
  const [Comp, setComp] = useState<((p: { data: any }) => any) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plugins/${pluginType}/component`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
      .then((src) => {
        if (cancelled) return;
        // Plugin component sources are loaded from trusted server-side plugin files.
        // This dynamic evaluation is intentional for the plugin system.
        const React = require("react");
        const fn = new Function("React", `"use strict"; return (${src})`);
        const c = fn(React);
        if (typeof c === "function") setComp(() => c);
        else setError("Plugin did not return a component");
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [pluginType]);

  if (error) return <div className="output-error">{error}</div>;
  if (!Comp) return <div className="output-result"><span className="loading-inline"><img src="./favicon.png" className="loading-mascot-sm" alt="" /> Loading...</span></div>;
  return <Comp data={data} />;
}
