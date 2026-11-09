import { Routes, Route } from 'react-router';
import Login from './Login';
import Dashboard from './Dashboard';
import CreateRecord from './CreateRecord';
import EditRecord from './EditRecord'; // Import this

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/create" element={<CreateRecord />} />
      <Route path="/edit/:id" element={<EditRecord />} />
    </Routes>
  );
}

export default App;