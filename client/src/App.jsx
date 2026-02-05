import { useState } from 'react';
import WorkflowBuilder from './components/WorkflowBuilder';
import WorkflowRunner from './components/WorkflowRunner';
import { Layout } from 'lucide-react';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingWorkflow, setEditingWorkflow] = useState(null); // State for Edit Mode

  const handleEdit = (workflow) => {
    setEditingWorkflow(workflow);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see builder
  };

  const handleWorkflowSaved = () => {
    setRefreshKey(k => k + 1); // Refresh list
    setEditingWorkflow(null);  // Exit edit mode
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <div className="col-span-full mb-4 flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-lg text-white">
            <Layout size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Agentic Workflow Builder</h1>
            <p className="text-gray-500">Unbound Hackathon 2026</p>
          </div>
        </div>

        <div className="col-span-1">
          <WorkflowBuilder 
            onWorkflowCreated={handleWorkflowSaved} 
            editData={editingWorkflow}
            onCancelEdit={() => setEditingWorkflow(null)}
          />
        </div>

        <div className="col-span-1">
          <WorkflowRunner 
            key={refreshKey} 
            onEdit={handleEdit} 
          />
        </div>

      </div>
    </div>
  );
}

export default App;