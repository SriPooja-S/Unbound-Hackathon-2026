import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, X } from 'lucide-react';

export default function WorkflowBuilder({ onWorkflowCreated, editData, onCancelEdit }) {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([
    { order: 1, model: 'kimi-k2p5', prompt_template: '', completion_criteria: 'always_pass' }
  ]);

  useEffect(() => {
    if (editData) {
      setName(editData.name);
      // Safety check: use empty array if steps are missing
      setSteps(editData.steps || []);
    } else {
        setName('');
        setSteps([{ order: 1, model: 'kimi-k2p5', prompt_template: '', completion_criteria: 'always_pass' }]);
    }
  }, [editData]);

  const addStep = () => {
    setSteps([...steps, { 
      order: steps.length + 1, 
      model: 'kimi-k2p5', 
      prompt_template: '', 
      completion_criteria: 'always_pass' 
    }]);
  };

  const removeStep = (index) => {
    if (steps.length === 1) return;
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const handleSubmit = async () => {
    if (!name) return alert("Please name your workflow");
    
    try {
      if (editData) {
        await axios.put(`http://localhost:8000/workflows/${editData.id}`, { name, steps });
        alert('Workflow Updated!');
      } else {
        await axios.post('http://localhost:8000/workflows/', { name, steps });
        alert('Workflow Saved!');
      }
      
      setName('');
      setSteps([{ order: 1, model: 'kimi-k2p5', prompt_template: '', completion_criteria: 'always_pass' }]);
      if (onWorkflowCreated) onWorkflowCreated();
    } catch (error) {
      console.error(error);
      alert('Failed to save workflow');
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md border-t-4 border-blue-600">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{editData ? '✏️ Edit Workflow' : '🛠 Build New Workflow'}</h2>
        {editData && (
          <button onClick={onCancelEdit} className="text-gray-500 hover:text-red-500">
            <X size={20}/>
          </button>
        )}
      </div>
      
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-1">Workflow Name</label>
        <input
            type="text"
            placeholder="e.g. Python Calculator Generator"
            className="w-full p-2 border rounded text-lg font-semibold"
            value={name}
            onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="border p-4 rounded bg-gray-50 relative">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-gray-700">Step {step.order}</span>
              {steps.length > 1 && (
                <button onClick={() => removeStep(index)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={18} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                    <label className="text-xs font-bold text-gray-500">Model</label>
                    <select 
                        className="w-full p-2 border rounded text-sm"
                        value={step.model}
                        onChange={(e) => updateStep(index, 'model', e.target.value)}
                    >
                        <option value="kimi-k2p5">kimi-k2p5 (Standard)</option>
                        <option value="kimi-k2-instruct-0905">kimi-k2-instruct (Pro)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">Success Criteria</label>
                    <select 
                        className="w-full p-2 border rounded text-sm"
                        value={step.completion_criteria}
                        onChange={(e) => updateStep(index, 'completion_criteria', e.target.value)}
                    >
                        <option value="always_pass">Always Pass</option>
                        <option value="CODE_BLOCK">Must contain Code (```)</option>
                        <option value="CONTAINS:Success">Must contain "Success"</option>
                    </select>
                </div>
            </div>

            <div className="mb-1">
                <label className="text-xs font-bold text-gray-500">Prompt Template</label>
                <textarea
                className="w-full p-2 border rounded h-24 text-sm font-mono"
                placeholder="Use {previous_context} to insert output from last step."
                value={step.prompt_template}
                onChange={(e) => updateStep(index, 'prompt_template', e.target.value)}
                />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-4">
        <button onClick={addStep} className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 font-medium">
          <Plus size={18} /> Add Step
        </button>
        <button onClick={handleSubmit} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto font-medium shadow-sm">
          <Save size={18} /> {editData ? 'Update Workflow' : 'Save Workflow'}
        </button>
      </div>
    </div>
  );
}