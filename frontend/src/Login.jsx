import { useState } from 'react';
import api from './api';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        
        e.preventDefault();
        setError('');
        
        try {
            const response = await api.post('/login', { email, password });
            const token = response.data.access_token;
            localStorage.setItem('auth_token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            window.location.href = '/dashboard'; 
        } catch {
            setError('Authentication failed. Please verify the credentials.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-96 flex flex-col">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">BioMatch System</h2>
                
                {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
                
                <input 
                    type="email" 
                    placeholder="Admin Email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="mb-4 p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required 
                />
                
                <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    className="mb-6 p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required 
                />
                
                <button type="submit" className="bg-blue-600 text-white p-3 rounded font-semibold hover:bg-blue-700 transition duration-200">
                    Access System
                </button>
            </form>
        </div>
    );
}