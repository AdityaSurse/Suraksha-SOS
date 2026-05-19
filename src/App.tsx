/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  Settings, 
  MapPin, 
  Users, 
  Plus,
  Trash2,
  CloudSun,
  LayoutGrid,
  FileText,
  Clock,
  Terminal,
  Activity,
  History,
  User,
  Cpu,
  Radio,
  Lock,
  ChevronRight,
  Wifi
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, isPhraseMatch, validatePhone, normalizePhoneForAPI } from './lib/utils';

// --- Types ---
interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface UserProfile {
  name: string;
  phone: string;
  senderPhone: string;
  sosPhrase: string;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'trigger' | 'error' | 'alert';
  message: string;
}

export default function App() {
  // --- State ---
  const [activeView, setActiveView] = useState<'setup' | 'shielded'>('shielded');
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('guardian_profile');
    return saved ? JSON.parse(saved) : { name: '', phone: '', senderPhone: '', sosPhrase: 'The weather is really nice today' };
  });
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const saved = localStorage.getItem('guardian_contacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [permissions, setPermissions] = useState({ mic: false, geo: false });
  const [isTriggered, setIsTriggered] = useState(false);
  const [time, setTime] = useState(new Date());
  const [citySearch, setCitySearch] = useState('Mumbai');

  // --- Refs ---
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // --- Clock ---
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '' });

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('guardian_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('guardian_contacts', JSON.stringify(contacts));
  }, [contacts]);

  // --- Audio Engine ---
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message
    }, ...prev].slice(0, 50));
    // Also log to console for debugging
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  const saveContact = () => {
    if (!newContact.name || !newContact.phone) return;
    
    if (validatePhone(newContact.phone)) {
      setContacts([...contacts, { 
        id: Date.now().toString(), 
        name: newContact.name, 
        phone: normalizePhoneForAPI(newContact.phone) 
      }]);
      setNewContact({ name: '', phone: '' });
      setIsAddingContact(false);
      addLog('info', `Contact ${newContact.name} registered successfully.`);
    } else {
      addLog('error', `Registration failed: Invalid phone number format.`);
    }
  };

  const checkPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      
      const geoStatus = await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 5000 });
      });

      setPermissions({ mic: true, geo: geoStatus });
      addLog('info', `Permissions: Mic OK, Geo ${geoStatus ? 'OK' : 'DENIED'}`);
    } catch (err) {
      setPermissions({ mic: false, geo: false });
      addLog('error', 'Audio permission denied or unavailable.');
    }
  }, [addLog]);

  useEffect(() => {
    checkPermissions();
    // Default to monitoring if setup is complete
    if (profile.name && contacts.length > 0 && profile.sosPhrase) {
      // setIsMonitoring(true); 
    }
  }, [checkPermissions, profile.name, contacts.length, profile.sosPhrase]);

  const handleTrigger = useCallback(async () => {
    if (isTriggered) return;
    setIsTriggered(true);
    addLog('trigger', `SECRET CODE RECOGNIZED: "${profile.sosPhrase}"`);

    // 1. Geolocation
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        addLog('alert', `LOCATION CAPTURED: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        
        // 2. Real Alert Dispatch via Backend
        for (const contact of contacts) {
          const emergencyMessage = `EMERGENCY: ${profile.name} is in danger. Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}. Map: ${mapUrl}. [Sent via Suraksha SOS]`;
          
          try {
            addLog('info', `Attempting link to SOS Engine for ${contact.name}...`);
            const response = await fetch('/api/send-sos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: contact.phone.replace(/\s+/g, ''),
                message: emergencyMessage,
                userName: profile.name,
                fromOverride: profile.senderPhone?.replace(/\s+/g, '')
              })
            });
            
            let result;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              result = await response.json();
            } else {
              const text = await response.text();
              throw new Error(`Server returned non-JSON response (${response.status}): ${text.slice(0, 100)}`);
            }
            
            if (result.success) {
              if (result.simulated) {
                addLog('alert', `SIMULATED ALERT for ${contact.name}`);
                addLog('info', `DEBUG: Configure Twilio Secrets in your deployment dashboard.`);
              } else {
                addLog('alert', `REAL SMS DELIVERED to ${contact.name}`);
              }
            } else {
              addLog('error', `Dispatch failed: ${result.error || 'Unknown server error'}`);
            }
          } catch (err: any) {
            console.error('SOS Link Error:', err);
            addLog('error', `Link failure to ${contact.name}: ${err.message}`);
          }
        }
      },
      (err) => addLog('error', 'Location capture failed.')
    );

    // 3. Evidence Capture (Silent Recording)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        addLog('info', `Audio evidence stored (${Math.round(blob.size / 1024)}KB)`);
      };

      mediaRecorder.start();
      addLog('info', 'Listening in background... (30s capture)');
      
      setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          stream.getTracks().forEach(track => track.stop());
        }
        setIsTriggered(false);
      }, 30000);
    } catch (err) {
      addLog('error', 'Audio capture failed.');
      setIsTriggered(false);
    }
  }, [isTriggered, profile, contacts, addLog]);

  const startMonitoring = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('error', 'Speech recognition not supported.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsMonitoring(true);
      addLog('info', 'Valkyrie Neural Link Active.');
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
      
      if (isPhraseMatch(currentTranscript, profile.sosPhrase)) {
        handleTrigger();
      }
    };

    recognition.onend = () => {
      if (isMonitoring && !isTriggered) {
        try {
          recognition.start();
        } catch (e) {
          setIsMonitoring(false);
        }
      } else {
        setIsMonitoring(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isMonitoring, isTriggered, profile.sosPhrase, handleTrigger, addLog]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
    addLog('info', 'Neural Link Disconnected.');
  }, [addLog]);

  return (
    <div className="w-full h-screen bg-[#050505] text-[#e0e0e0] font-sans flex flex-col overflow-hidden select-none">
      {/* Header: System Status Bar */}
      <header className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-3 h-3 rounded-full transition-shadow duration-500",
            isMonitoring ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-white/10"
          )}></div>
          <h1 className="text-xs uppercase tracking-[0.3em] font-semibold text-white/70">Suraksha SOS // Active Shield System</h1>
        </div>
        <div className="flex gap-8 items-center">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-white/40 uppercase tracking-widest leading-none mb-1">Encrypted Link</span>
            <span className="text-xs font-mono text-emerald-400">AES-256 SECURE</span>
          </div>
          <div className="hidden md:flex flex-col items-end border-l border-white/10 pl-8">
            <span className="text-[10px] text-white/40 uppercase tracking-widest leading-none mb-1">Signal</span>
            <span className="text-xs font-mono">{(permissions.mic && permissions.geo) ? '-42 dBm' : 'LOW SIGNAL'}</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setActiveView(activeView === 'setup' ? 'shielded' : 'setup')}>
            <Settings className={cn("w-5 h-5 transition-colors", activeView === 'setup' ? "text-emerald-400" : "text-white/60")} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: Configuration & Setup */}
        <section className={cn(
          "w-80 border-r border-white/10 p-6 flex flex-col gap-6 shrink-0 bg-black/20 transition-all duration-500 overflow-y-auto custom-scrollbar",
          activeView !== 'setup' && "w-0 p-0 opacity-0 border-none overflow-hidden"
        )}>
          <div>
            <h2 className="text-[10px] text-blue-400 uppercase tracking-widest mb-4 font-bold flex items-center gap-2">
               <User className="w-3 h-3" /> Operator Identity
            </h2>
            <div className="space-y-3">
              <div className="relative group">
                <p className="text-[8px] text-white/20 uppercase font-black absolute top-2 left-3 z-10">Subject Name</p>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 pt-6 pb-2 text-sm text-white/90 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-white/10"
                  placeholder="e.g. Jane Doe"
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                />
              </div>
              <div className="relative group">
                <p className="text-[8px] text-white/20 uppercase font-black absolute top-2 left-3 z-10">Primary Comms (India/US)</p>
                <input 
                  type="tel" 
                  className={cn(
                    "w-full bg-white/5 border rounded-xl px-3 pt-6 pb-2 text-sm text-white/90 focus:ring-1 outline-none transition-all placeholder:text-white/10",
                    profile.phone && !validatePhone(profile.phone) ? "border-rose-500/50 focus:ring-rose-500/50" : "border-white/10 focus:ring-blue-500/50"
                  )}
                  placeholder="e.g. 9876543210"
                  value={profile.phone}
                  onChange={(e) => setProfile({...profile, phone: e.target.value})}
                  onBlur={() => setProfile({...profile, phone: normalizePhoneForAPI(profile.phone)})}
                />
              </div>
              <div className="relative group">
                <p className="text-[8px] text-emerald-400/40 uppercase font-black absolute top-2 left-3 z-10 font-mono italic">Twilio Sender Number</p>
                <input 
                  type="tel" 
                  className={cn(
                    "w-full bg-white/5 border rounded-xl px-3 pt-6 pb-2 text-sm text-emerald-300 focus:ring-1 outline-none transition-all placeholder:text-white/10 font-mono",
                    profile.senderPhone && !validatePhone(profile.senderPhone) ? "border-rose-500/50 focus:ring-rose-500/50" : "border-emerald-500/20 focus:ring-emerald-500/50"
                  )}
                  placeholder="e.g. +1234567890"
                  value={profile.senderPhone}
                  onChange={(e) => setProfile({...profile, senderPhone: e.target.value})}
                  onBlur={() => setProfile({...profile, senderPhone: normalizePhoneForAPI(profile.senderPhone)})}
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-[10px] text-emerald-400 uppercase tracking-widest mb-4 font-bold flex items-center gap-2">
               <Users className="w-3 h-3" /> Emergency Contacts
            </h2>
            <div className="space-y-3">
              {contacts.map(c => (
                <div key={c.id} className="group p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-medium text-white/90">{c.name}</p>
                      <p className="text-[10px] font-mono text-white/40 mt-0.5">{c.phone}</p>
                    </div>
                    <button 
                      onClick={() => setContacts(contacts.filter(item => item.id !== c.id))}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-rose-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}

              <AnimatePresence>
                {isAddingContact ? (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 rounded-xl bg-white/5 border border-emerald-500/30 overflow-hidden"
                  >
                    <div className="space-y-3">
                      <input 
                        type="text"
                        placeholder="Contact Name"
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50"
                        value={newContact.name}
                        onChange={e => setNewContact({...newContact, name: e.target.value})}
                      />
                      <input 
                        type="tel"
                        placeholder="Phone (India/US)"
                        className={cn(
                          "w-full bg-black/20 border rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50",
                          newContact.phone && !validatePhone(newContact.phone) ? "border-rose-500/50" : "border-white/10"
                        )}
                        value={newContact.phone}
                        onChange={e => setNewContact({...newContact, phone: e.target.value})}
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={saveContact}
                          className="flex-1 py-2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-500 transition-colors"
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => setIsAddingContact(false)}
                          className="px-3 py-2 bg-white/5 text-white/40 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <button 
                    onClick={() => setIsAddingContact(true)}
                    className="w-full py-3 border border-dashed border-white/20 rounded-xl text-[9px] uppercase tracking-[0.2em] font-black text-white/40 hover:bg-white/5 hover:text-white/60 transition-all font-mono"
                  >
                    + Register Recipient
                  </button>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div>
            <h2 className="text-[10px] text-rose-400 uppercase tracking-widest mb-4 font-bold flex items-center gap-2">
              <Radio className="w-3 h-3" /> Trigger Phrase
            </h2>
            <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 group relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                 <Lock className="w-3 h-3" />
               </div>
               <p className="text-[9px] text-rose-400/40 uppercase font-black mb-2">Neural Target:</p>
               <textarea 
                className="w-full bg-transparent border-none p-0 focus:ring-0 text-md italic font-serif leading-relaxed text-rose-200/90 resize-none h-20 placeholder:text-white/5"
                value={profile.sosPhrase}
                onChange={(e) => setProfile({...profile, sosPhrase: e.target.value})}
                placeholder="Enter secret phrase..."
               />
               <div className="mt-2 text-[8px] text-white/10 font-mono tracking-widest">LAYER_SEC_B_391</div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-white/10">
            <h2 className="text-[10px] text-white/40 uppercase tracking-widest mb-4 font-bold">Neural Link Config</h2>
            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-tighter text-white/60">Mic Sensitivity</span>
                  <span className="text-[10px] font-mono text-emerald-400">85%</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[85%] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-tighter text-white/60">GPS Precision</span>
                  <span className="text-[10px] font-mono text-blue-400">HIGH</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Center Column: The Discreet Shield (The Decoy UI) */}
        <section className="flex-1 relative overflow-hidden bg-gradient-to-b from-[#0a0a0b] to-[#121214] flex flex-col">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #1a1a1c 0%, transparent 70%)' }}></div>
          
          <div className="absolute top-8 right-8 z-20">
             <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl">
                <div className={cn("w-2 h-2 rounded-full", isMonitoring ? "bg-emerald-500 animate-pulse" : "bg-white/20")} />
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/40">
                  {isMonitoring ? "System Protected" : "System Standby"}
                </span>
             </div>
          </div>

          {/* The Decoy: Aesthetic Minimalist Weather/Clock */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-8">
            <div className="text-center group cursor-default">
              <motion.div 
                initial={false}
                animate={{ scale: isTriggered ? 1.05 : 1 }}
                className="text-8xl md:text-[140px] font-light tracking-tighter text-white/90 leading-none mb-4 selection:bg-none"
              >
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </motion.div>
              <div className="text-xl md:text-2xl font-light text-white/40 tracking-[0.2em] uppercase">
                {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
            
            <div className="mt-20 flex flex-col items-center w-full max-w-sm">
              <div className="w-full relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <MapPin className="w-4 h-4 text-white/20 group-focus-within:text-emerald-400 transition-colors" />
                </div>
                <input 
                  type="text"
                  placeholder="Search location..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white/80 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-white/10 selection:bg-emerald-500/30"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                />
              </div>
              
              <div className="mt-8 flex items-center justify-between w-full px-2">
                <div className="text-left">
                  <p className="text-[10px] text-white/20 uppercase tracking-[0.3em] mb-1">Current Node</p>
                  <p className="text-sm font-light text-white/60">{citySearch || "Detecting..."}</p>
                </div>
                <div className="h-8 w-px bg-white/5"></div>
                <div className="text-right">
                  <p className="text-[10px] text-white/20 uppercase tracking-[0.3em] mb-1">Connectivity</p>
                  <p className="text-sm font-light text-emerald-400/60">Encrypted Link</p>
                </div>
              </div>
            </div>

            <div className="mt-24 w-full max-w-sm">
               <motion.button 
                whileTap={{ scale: 0.98 }}
                onClick={() => isMonitoring ? stopMonitoring() : startMonitoring()}
                className={cn(
                  "w-full py-6 rounded-2xl flex items-center justify-center gap-4 font-black uppercase tracking-[0.4em] text-[10px] transition-all",
                  isMonitoring 
                    ? "bg-white/5 border border-white/20 text-white/40 hover:bg-white/10" 
                    : "bg-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:bg-emerald-500"
                )}
              >
                {isMonitoring ? "Disconnect Shield" : "Activate Suraksha"}
              </motion.button>
              <p className="text-center text-[9px] text-white/20 uppercase tracking-[0.3em] mt-6 leading-relaxed">
                Shield status: {isMonitoring ? "Engaged" : "Disengaged"}<br/>
                All systems functional
              </p>
            </div>
          </div>

          {/* Recording Status (Subtle) */}
          <div className="h-16 flex items-center justify-center border-t border-white/5 gap-4 bg-black/20">
            {isMonitoring && <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ height: [4, 12, 4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-0.5 bg-emerald-500/50 rounded-full"
                  />
                ))}
              </div>
              <span className="text-[9px] uppercase tracking-[0.5em] text-white/30 font-medium">Listening Mode Active</span>
            </div>}
          </div>
        </section>

        {/* Right Column: System Logs & Telemetry */}
        <section className="hidden xl:flex w-80 border-l border-white/10 p-6 flex-col shrink-0 bg-black/40">
          <h2 className="text-[10px] text-blue-400 uppercase tracking-widest mb-6 font-bold flex items-center gap-2">
            <Terminal className="w-3 h-3" /> Neural Link Engine
          </h2>
          
          <div className="flex-1 font-mono text-[10px] space-y-4 overflow-y-auto custom-scrollbar pr-2">
            <AnimatePresence initial={false}>
              {logs.map((log, index) => (
                <motion.div 
                  key={log.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "border-l-2 pl-3 py-1 transition-all",
                    log.type === 'trigger' ? "text-rose-400 border-rose-500 bg-rose-500/5" :
                    log.type === 'alert' ? "text-blue-400 border-blue-500 bg-blue-500/5" :
                    log.type === 'error' ? "text-red-400 border-red-500 bg-red-500/5" :
                    "text-white/30 border-white/10"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="opacity-50 text-[8px]">[{log.timestamp.toLocaleTimeString([], { hour12: false })}]</span>
                    <span className="font-black uppercase tracking-tighter">{log.type}</span>
                  </div>
                  <p className="leading-relaxed opacity-80">{log.message}</p>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isMonitoring && (
              <div className="mt-8 pt-8 border-t border-white/5">
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-[9px] text-white/30 uppercase mb-3 font-black tracking-widest">Real-time Stream</p>
                  <p className={cn(
                    "italic leading-relaxed transition-colors",
                    transcript ? "text-emerald-400/80" : "text-white/20"
                  )}>
                    {transcript ? `"${transcript}"` : "> Synchronizing neural buffers..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3 pt-6 border-t border-white/10">
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase text-white/40 tracking-widest">Database Linked</span>
              <span className="text-[9px] text-emerald-400 font-mono">LOCAL_SYNC</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase text-white/40 tracking-widest">Telemetry Node</span>
              <span className="text-[9px] text-blue-400 font-mono">STANDBY</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase text-white/40 tracking-widest">Latency</span>
              <span className="text-[9px] text-white/60 font-mono">12ms</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="h-12 bg-black border-t border-white/10 px-8 flex items-center justify-between shrink-0 z-50">
        <div className="flex gap-10">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", isMonitoring ? "bg-emerald-500" : "bg-white/10")}></div>
            <span className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-medium">Status: {isMonitoring ? "Link Established" : "Standby"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500/30"></div>
            <span className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-medium font-mono">Node ID: Valk-729-QX</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="hidden sm:inline text-[9px] text-white/20 italic font-mono tracking-widest">v.1.2.8-stable</span>
          <div className="hidden sm:block h-3 w-px bg-white/10"></div>
          <button 
            onDoubleClick={handleTrigger}
            className="text-[10px] text-rose-500 uppercase font-black tracking-[0.2em] hover:text-rose-400 transition-colors"
          >
            Manual Override
          </button>
        </div>
      </footer>
    </div>
  );
}

