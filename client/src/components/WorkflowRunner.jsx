import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { Play, Loader2, ChevronDown, ChevronUp, Edit, Trash2 } from 'lucide-react';

const socket = io('http://localhost:8000');

export default function WorkflowRunner({ onEdit }) {
  const [workflows, setWorkflows] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [activeLogs, setActiveLogs] = useState({}); 

  useEffect(() => {
    fetchWorkflows();
    socket.on('workflow_update', fetchWorkflows);
    socket.on('step_update', (data) => {
      setActiveLogs(prev => ({ ...prev, [data.id]: data }));
    });
    return () => socket.off();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await axios.get('http://localhost:8000/workflows/');
      setWorkflows(res.data);
    } catch (e) { console.error(e); }
  };

  const runWorkflow = async (id) => {
    setExpandedId(id); 
    setActiveLogs({}); 
    await axios.post(`http://localhost:8000/workflows/${id}/run`);
  };

  const deleteWorkflow = async (id) => {
    if(!confirm("Are you sure?")) return;
    try {
      await axios.delete(`http://localhost:8000/workflows/${id}`);
      fetchWorkflows();
    } catch (e) { alert("Delete failed"); }
  };

  const toggleExpand = (id) => setExpandedId(expandedId === id ? null : id);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">🚀 Your Workflows</h2>
      <div className="grid gap-4">
        {workflows.map((wf) => (
          <div key={wf.id} className="border rounded p-4 bg-gray-50">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{wf.name}</h3>
                <span className={`text-xs px-2 py-1 rounded font-bold ${
                  wf.status === 'completed' ? 'bg-green-200 text-green-800' :
                  wf.status === 'failed' ? 'bg-red-200 text-red-800' : 
                  wf.status === 'running' ? 'bg-blue-200 text-blue-800' : 'bg-gray-200'
                }`}>{wf.status?.toUpperCase()}</span>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => deleteWorkflow(wf.id)} className="p-2 text-red-500 hover:bg-red-100 rounded"><Trash2 size={18} /></button>
                <button onClick={() => onEdit(wf)} className="p-2 text-gray-600 hover:bg-gray-200 rounded"><Edit size={18} /></button>
                <button onClick={() => runWorkflow(wf.id)} disabled={wf.status === 'running'} className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                  {wf.status === 'running' ? <Loader2 className="animate-spin" size={16}/> : <Play size={16} />} Run
                </button>
                <button onClick={() => toggleExpand(wf.id)} className="p-2 text-gray-500 hover:bg-gray-200 rounded">
                  {expandedId === wf.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
            </div>

            {expandedId === wf.id && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                {wf.steps && wf.steps.length > 0 ? (
                    wf.steps.slice().sort((a,b) => a.order - b.order).map((step) => {
                    const liveLog = activeLogs[step.id];
                    const status = liveLog?.status || step.status || 'pending';
                    const output = liveLog?.output || step.output_content;
                    const error = liveLog?.error || step.error_log;

                    return (
                        <div key={step.id} className="bg-white border rounded p-3 shadow-sm">
                        <div className="flex justify-between mb-2">
                            <span className="font-semibold text-gray-700">Step {step.order}</span>
                            <span className={`text-xs font-mono font-bold ${
                            status === 'failed' ? 'text-red-600' : 
                            status === 'completed' ? 'text-green-600' : 'text-blue-600'
                            }`}>{status.toUpperCase()}</span>
                        </div>
                        <div className="text-xs text-gray-500 mb-1">Prompt:</div>
                        <div className="bg-gray-100 p-2 rounded text-sm mb-2 font-mono whitespace-pre-wrap text-gray-700">
                            {step.prompt_template}
                        </div>
                        
                        {(output || error) && (
                            <>
                            <div className="text-xs text-gray-500 mb-1">Output / History:</div>
                            {/* FORCE BLACK TERMINAL STYLE HERE */}
                            <div className="p-3 rounded text-sm font-mono whitespace-pre-wrap max-h-60 overflow-auto bg-black text-green-400 shadow-inner">
                                {output}
                                {error && <div className="text-red-500 mt-2 border-t border-red-900 pt-2 font-bold">Error: {error}</div>}
                            </div>
                            </>
                        )}
                        </div>
                    );
                    })
                ) : (
                    <div className="text-center text-gray-500">No steps found.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}