import React, { useState, useEffect, useRef } from 'react';
import { loadGameState, saveGameState, clearGameState } from './gameStorage';
import { getNpcLocation, CONNECTIONS } from './data/world';

const getRelationshipLabel = (npcId, points, flags = []) => {
  if (points === undefined) return 'Desconocido';
  const isRomanceActive = flags.includes(`romance_${npcId}`);
  if (isRomanceActive) return 'Pareja';
  if (points >= 8) return 'Íntimo';
  if (points >= 5) return 'Confidente';
  if (points >= 2) return 'Amigo';
  if (points <= -6) return 'Enemigo';
  if (points <= -2) return 'Hostil';
  return 'Conocido';
};

const DEFAULT_PARTICIPANTS = ['alcaldesa', 'herrero', 'posadera'];

export default function App() {
  // World states loaded dynamically from server
  const [locations, setLocations] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [expressionsList, setExpressionsList] = useState([]);
  const [events, setEvents] = useState([]);

  // App Simulation States
  const [locationId, setLocationId] = useState('plaza');
  const [participantIds, setParticipantIds] = useState([...DEFAULT_PARTICIPANTS]);
  const [messages, setMessages] = useState([]);
  const [messageIndex, setMessageIndex] = useState(-1);
  const [expressions, setExpressions] = useState({});
  const [history, setHistory] = useState([]);
  const [relationships, setRelationships] = useState({});
  const [trust, setTrust] = useState({});
  const [bgKey, setBgKey] = useState(0); // incremented to force background img remount
  const [restoreComplete, setRestoreComplete] = useState(false);

  // Event Engine States
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('08:00');
  const [timeOfDay, setTimeOfDay] = useState('mañana');
  const [flags, setFlags] = useState([]);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [travelQueue, setTravelQueue] = useState([]);
  
  // UI and UX States
  const [provider, setProvider] = useState('gemini');
  const [availableProviders, setAvailableProviders] = useState({
    gemini: { available: false, model: 'gemini-2.5-flash' },
    openai: { available: false, model: 'gpt-5.5' }
  });
  const [narration, setNarration] = useState('');
  const [inventory, setInventory] = useState([]);
  const [gold, setGold] = useState(15); // Start with 15 gold
  const [quests, setQuests] = useState([]);
  const [npcActivityLog, setNpcActivityLog] = useState([]);
  const [awaitingPlayer, setAwaitingPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('travel');
  const [playerInputText, setPlayerInputText] = useState('');
  
  // Typewriter Animation States
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef(null);
  const currentLineRef = useRef('');

  const inputRef = useRef(null);
  const handleAdvanceRef = useRef(null);
  const locationIdRef = useRef('plaza');
  const participantIdsRef = useRef([...DEFAULT_PARTICIPANTS]);
  const messagesRef = useRef([]);
  const messageIndexRef = useRef(-1);
  const historyRef = useRef([]);
  const relationshipsRef = useRef({});
  const trustRef = useRef({});
  const npcsRef = useRef([]);
  const locationsRef = useRef([]);
  const dayRef = useRef(1);
  const timeRef = useRef('08:00');
  const timeOfDayRef = useRef('mañana');
  const flagsRef = useRef([]);
  const completedEventsRef = useRef([]);
  const travelQueueRef = useRef([]);
  const providerRef = useRef('gemini');
  const narrationRef = useRef('');
  const inventoryRef = useRef([]);
  const goldRef = useRef(15);
  const questsRef = useRef([]);
  const npcActivityLogRef = useRef([]);

  // Initialize: Load dynamic world metadata from server
  useEffect(() => {
    const loadWorldData = async () => {
      setLoading(true);
      try {
        let activeConf = {
          gemini: { available: false, model: 'gemini-2.5-flash' },
          openai: { available: false, model: 'gpt-5.5' }
        };
        try {
          const configResponse = await fetch('/api/config');
          const configData = await configResponse.json();
          if (configData && configData.providers) {
            activeConf = configData.providers;
            setAvailableProviders(activeConf);
          }
        } catch (configErr) {
          console.error('Failed to fetch provider config:', configErr);
        }

        const response = await fetch('/api/world');
        const data = await response.json();

        setLocations(data.locations || []);
        setNpcs(data.npcs || []);
        setExpressionsList(data.expressions || []);
        setEvents(data.events || []);

        const initialRels = {};
        const initialTrust = {};
        (data.npcs || []).forEach((npc) => {
          initialRels[npc.id] = 0;
          initialTrust[npc.id] = 0;
        });
        setRelationships(initialRels);
        setTrust(initialTrust);

        let defaultProv = 'gemini';
        if (activeConf.gemini && activeConf.gemini.available) {
          defaultProv = 'gemini';
        } else if (activeConf.openai && activeConf.openai.available) {
          defaultProv = 'openai';
        }

        const savedState = loadGameState();
        if (savedState) {
          if (savedState.provider) {
            setProvider(savedState.provider);
            providerRef.current = savedState.provider;
          } else {
            setProvider(defaultProv);
            providerRef.current = defaultProv;
          }
          if (savedState.narration) {
            setNarration(savedState.narration);
            narrationRef.current = savedState.narration;
          }
          if (savedState.inventory) {
            setInventory(savedState.inventory);
            inventoryRef.current = savedState.inventory;
          }
          if (savedState.gold !== undefined) {
            setGold(savedState.gold);
            goldRef.current = savedState.gold;
          }
          if (savedState.quests) {
            setQuests(savedState.quests);
            questsRef.current = savedState.quests;
          }
          if (savedState.npcActivityLog) {
            setNpcActivityLog(savedState.npcActivityLog);
            npcActivityLogRef.current = savedState.npcActivityLog;
          }
          if (savedState.locationId) {
            setLocationId(savedState.locationId);
            locationIdRef.current = savedState.locationId;
          }
          if (savedState.participantIds) {
            setParticipantIds(savedState.participantIds);
            participantIdsRef.current = savedState.participantIds;
          }
          if (savedState.messages) {
            setMessages(savedState.messages);
            messagesRef.current = savedState.messages;
          }
          if (savedState.messageIndex !== undefined) {
            setMessageIndex(savedState.messageIndex);
            messageIndexRef.current = savedState.messageIndex;
          }
          if (savedState.history) {
            setHistory(savedState.history);
            historyRef.current = savedState.history;
          }
          if (savedState.relationships) {
            setRelationships(savedState.relationships);
            relationshipsRef.current = savedState.relationships;
          }
          if (savedState.trust) {
            setTrust(savedState.trust);
            trustRef.current = savedState.trust;
          }
          if (savedState.npcs) {
            const serverNpcs = data.npcs || [];
            const merged = [...serverNpcs];
            savedState.npcs.forEach(savedNpc => {
              if (!merged.some(n => n.id === savedNpc.id)) {
                merged.push(savedNpc);
              }
            });
            setNpcs(merged);
            npcsRef.current = merged;
          }
          if (savedState.locations) {
            const serverLocations = data.locations || [];
            const merged = [...serverLocations];
            savedState.locations.forEach(savedLoc => {
              if (!merged.some(l => l.id === savedLoc.id)) {
                merged.push(savedLoc);
              }
            });
            setLocations(merged);
            locationsRef.current = merged;
          }
          if (savedState.day !== undefined) {
            setDay(savedState.day);
            dayRef.current = savedState.day;
          }
          if (savedState.time !== undefined) {
            setTime(savedState.time);
            timeRef.current = savedState.time;
          }
          if (savedState.timeOfDay !== undefined) {
            setTimeOfDay(savedState.timeOfDay);
            timeOfDayRef.current = savedState.timeOfDay;
          }
          if (savedState.flags !== undefined) {
            setFlags(savedState.flags);
            flagsRef.current = savedState.flags;
          }
          if (savedState.completedEvents !== undefined) {
            setCompletedEvents(savedState.completedEvents);
            completedEventsRef.current = savedState.completedEvents;
          }
          if (savedState.travelQueue !== undefined) {
            setTravelQueue(savedState.travelQueue);
            travelQueueRef.current = savedState.travelQueue;
          }
          setBgKey((k) => k + 1);
          setRestoreComplete(true);
          setLoading(false);
          return;
        }

        setProvider(defaultProv);
        providerRef.current = defaultProv;
        await startConversation('Inicio de escena: los aldeanos reaccionan a la llegada del viajero.', data.npcs || []);
      } catch (err) {
        console.error('Failed to fetch world data on mount:', err);
      } finally {
        setLoading(false);
      }
    };

    loadWorldData();

    const handleBeforeUnload = () => {
      saveGameState({
        locationId: locationIdRef.current,
        participantIds: participantIdsRef.current,
        messages: messagesRef.current,
        messageIndex: messageIndexRef.current,
        history: historyRef.current,
        relationships: relationshipsRef.current,
        trust: trustRef.current,
        npcs: npcsRef.current,
        locations: locationsRef.current,
        day: dayRef.current,
        time: timeRef.current,
        timeOfDay: timeOfDayRef.current,
        flags: flagsRef.current,
        completedEvents: completedEventsRef.current,
        travelQueue: travelQueueRef.current,
        provider: providerRef.current,
        narration: narrationRef.current,
        inventory: inventoryRef.current,
        gold: goldRef.current,
        quests: questsRef.current,
        npcActivityLog: npcActivityLogRef.current
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Global keyboard listener for SPACE key to advance dialogs
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (handleAdvanceRef.current) {
            handleAdvanceRef.current();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    locationIdRef.current = locationId;
    participantIdsRef.current = participantIds;
    messagesRef.current = messages;
    messageIndexRef.current = messageIndex;
    historyRef.current = history;
    relationshipsRef.current = relationships;
    trustRef.current = trust;
    npcsRef.current = npcs;
    locationsRef.current = locations;
    dayRef.current = day;
    timeRef.current = time;
    timeOfDayRef.current = timeOfDay;
    flagsRef.current = flags;
    completedEventsRef.current = completedEvents;
    travelQueueRef.current = travelQueue;
    providerRef.current = provider;
    narrationRef.current = narration;
    inventoryRef.current = inventory;
    goldRef.current = gold;
    questsRef.current = quests;
    npcActivityLogRef.current = npcActivityLog;
  }, [locationId, participantIds, messages, messageIndex, history, relationships, trust, npcs, locations, day, time, timeOfDay, flags, completedEvents, provider, narration, inventory, gold, quests, npcActivityLog, travelQueue]);

  useEffect(() => {
    if (!restoreComplete && locations.length && npcs.length) {
      setRestoreComplete(true);
    }

    if (!restoreComplete) return;
    saveGameState({
      locationId,
      participantIds,
      messages,
      messageIndex,
      history,
      relationships,
      trust,
      npcs,
      locations,
      day,
      time,
      timeOfDay,
      flags,
      completedEvents,
      provider,
      narration,
      inventory,
      gold,
      quests,
      npcActivityLog,
      travelQueue
    });
  }, [locationId, participantIds, messages, messageIndex, history, relationships, trust, npcs, locations, restoreComplete, day, time, timeOfDay, flags, completedEvents, provider, narration, inventory, gold, quests, npcActivityLog, travelQueue]);

  // Polling for pending updates (quests and npcActions) generated in the background
  useEffect(() => {
    let active = true;
    const checkPendingUpdates = async () => {
      if (loading) return;
      try {
        const response = await fetch('/api/world/pending-updates');
        const data = await response.json();
        if (active) {
          if (data.npcActions && data.npcActions.length > 0) {
            setNpcActivityLog((prev) => {
              const filteredNew = data.npcActions.filter(na => !prev.some(p => p.day === na.day && p.npcId === na.npcId && p.action === na.action));
              if (filteredNew.length === 0) return prev;
              return [...prev, ...filteredNew];
            });
          }
          
          if (data.quests && data.quests.length > 0) {
            setQuests((prev) => {
              const filteredNew = data.quests.filter(nq => !prev.some(q => q.id === nq.id));
              if (filteredNew.length === 0) return prev;
              return [...prev, ...filteredNew];
            });
          }

          if (data.npcUpdates && data.npcUpdates.length > 0) {
            setNpcs((prev) => {
              return prev.map(npc => {
                const update = data.npcUpdates.find(u => u.id === npc.id);
                if (update) {
                  return { ...npc, ...update };
                }
                return npc;
              });
            });
          }
        }
      } catch (err) {
        console.error('[QuestEngine] Error polling pending updates:', err);
      }
    };

    const interval = setInterval(checkPendingUpdates, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loading]);

  // Update participants list and start new dialogue when location changes
  const handleTravel = async (newLocationId) => {
    if (loading) return;
    const prevLocId = locationIdRef.current || 'plaza';
    setLocationId(newLocationId);
    locationIdRef.current = newLocationId;

    // Check if an event triggers for this new location
    const available = events.filter((ev) => {
      if (ev.locationId !== newLocationId) return false;
      if (ev.day !== 0 && ev.day !== day) return false;
      if (ev.day === 0) {
        if (!ev.repeatable || !ev.repeatInterval) return false;
        if (day % ev.repeatInterval !== 0) return false;
      }
      if (ev.timeOfDay && ev.timeOfDay !== timeOfDay) return false;
      if (ev.requiresFlags && ev.requiresFlags.length > 0) {
        const hasAll = ev.requiresFlags.every(f => flags.includes(f));
        if (!hasAll) return false;
      }
      if (ev.excludesIfFlags && ev.excludesIfFlags.length > 0) {
        const hasAny = ev.excludesIfFlags.some(f => flags.includes(f));
        if (hasAny) return false;
      }
      if (!ev.repeatable && completedEvents.includes(ev.id)) return false;
      return true;
    });

    if (available.length > 0) {
      const priorityMap = { principal: 3, secundario: 2, ambiental: 1 };
      available.sort((a, b) => (priorityMap[b.type] || 0) - (priorityMap[a.type] || 0));
      const ev = available[0];

      setLoading(true);
      setAwaitingPlayer(false);
      setMessages([]);
      setMessageIndex(-1);
      setTypedText('');
      setIsTyping(false);

      const promptText = `[Evento Especial: ${ev.id}] Viajo a ${locations.find(l => l.id === newLocationId)?.name || newLocationId} y se inicia el suceso: ${ev.name}. ${ev.description}`;

      const npcIds = ev.involvedNpcs && ev.involvedNpcs.length > 0 ? ev.involvedNpcs : npcs.filter(n => n.locationId === newLocationId).map(n => n.id);
      setParticipantIds(npcIds);
      participantIdsRef.current = npcIds;

      await fetchConversation({
        locationId: newLocationId,
        participantIds: npcIds,
        playerText: promptText,
        currentRelationships: relationships,
        currentTrust: trust,
        currentNpcs: npcs,
        originLocationId: prevLocId
      });
      return;
    }
    
    // Resolve which NPCs belong in the new location using our dynamic routine list
    const nearby = npcs.filter((npc) => getNpcLocation(npc.id, timeOfDay, npc.locationId) === newLocationId);
    const newParticipants = nearby.slice(0, 4).map((npc) => npc.id);
    setParticipantIds(newParticipants);
    participantIdsRef.current = newParticipants;

    setLoading(true);
    setAwaitingPlayer(false);
    setMessages([]);
    setMessageIndex(-1);
    setTypedText('');
    setIsTyping(false);

    const locationName = locations.find((l) => l.id === newLocationId)?.name || newLocationId;
    const initialText = `Viaje a ${locationName}. Los personajes presentes reaccionan a mi llegada.`;
    
    await fetchConversation({
      locationId: newLocationId,
      participantIds: newParticipants,
      playerText: initialText,
      currentRelationships: relationships,
      currentTrust: trust,
      currentNpcs: npcs,
      originLocationId: prevLocId
    });
  };

  // Triggers dialog call on reply form submit
  const handleSubmitReply = async (e) => {
    if (e) e.preventDefault();
    const text = playerInputText.trim();
    if (!text || loading) return;

    setPlayerInputText('');
    setAwaitingPlayer(false);
    
    await startConversation(text, npcs);
  };

  const startConversation = async (playerText, currentNpcsList = npcs) => {
    setLoading(true);
    setAwaitingPlayer(false);
    setMessages([]);
    setMessageIndex(-1);
    setTypedText('');
    setIsTyping(false);
    
    // Use refs to always read committed, up-to-date location/participant state
    await fetchConversation({
      locationId: locationIdRef.current,
      participantIds: participantIdsRef.current,
      playerText,
      currentRelationships: relationships,
      currentTrust: trust,
      currentNpcs: currentNpcsList
    });
  };

  // Sends the API request and processes the visual novel response
  const fetchConversation = async ({
    locationId,
    participantIds,
    playerText,
    currentRelationships,
    currentTrust,
    currentNpcs,
    originLocationId = locationIdRef.current
  }) => {
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          participantIds,
          playerText,
          provider: providerRef.current,
          state: {
            locationId: originLocationId,
            relationships: currentRelationships,
            trust: currentTrust,
            day: dayRef.current,
            time: timeRef.current,
            flags: flagsRef.current,
            completedEvents: completedEventsRef.current,
            inventory: inventoryRef.current,
            gold: goldRef.current,
            quests: questsRef.current,
            npcActivityLog: npcActivityLogRef.current
          }
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Error de servidor.');
      applyConversation(payload, currentNpcs);
    } catch (error) {
      console.error('API Error, falling back to local conversation logic', error);
      applyConversation(makeLocalConversation(playerText, participantIds), currentNpcs);
    } finally {
      setLoading(false);
    }
  };

  const applyConversation = (payload, currentNpcs) => {
    const cleanLocation = payload.locationId || locationIdRef.current;

    if (Array.isArray(payload.history)) {
      setHistory(payload.history);
      historyRef.current = payload.history;
    }

    // Build a merged NPC list that includes any newly introduced NPC this turn
    let mergedNpcs = currentNpcs;

    // Add dynamic NPC if introduced by the DM
    if (payload.newNpc && payload.newNpc.id) {
      const exists = mergedNpcs.some((npc) => npc.id === payload.newNpc.id);
      if (!exists) {
        console.log('[Client] Adding new dynamic NPC:', payload.newNpc.name);
        mergedNpcs = [...mergedNpcs, payload.newNpc];
        setNpcs(mergedNpcs);
      }
      // Initialize stats for new NPC
      const npcId = payload.newNpc.id;
      setRelationships((prev) => ({ ...prev, [npcId]: prev[npcId] ?? 0 }));
      setTrust((prev) => ({ ...prev, [npcId]: prev[npcId] ?? 0 }));
    }

    // Add dynamic Location if introduced by the DM
    if (payload.newLocation && payload.newLocation.id) {
      const parentLocId = payload.newLocation.connectedTo || locationIdRef.current;
      const distance = payload.newLocation.distance || 5;

      setLocations((prev) => {
        const exists = prev.some((loc) => loc.id === payload.newLocation.id);
        const finalAsset = payload.newLocation.assetUrl
          || `assets/locations/${payload.newLocation.id}.png?t=${Date.now()}`;
        if (!exists) {
          console.log('[Client] Adding new dynamic Location:', payload.newLocation.name, 'asset:', finalAsset);
          
          // Bidirectionally link parent in client state list
          const updatedList = prev.map(loc => {
            if (loc.id === parentLocId) {
              const connExists = (loc.connections || []).some(c => c.to === payload.newLocation.id);
              if (!connExists) {
                return {
                  ...loc,
                  connections: [...(loc.connections || []), { to: payload.newLocation.id, distance: distance }]
                };
              }
            }
            return loc;
          });

          return [...updatedList, {
            id: payload.newLocation.id,
            name: payload.newLocation.name,
            asset: finalAsset,
            prompt: payload.newLocation.prompt,
            ambient: payload.newLocation.ambient,
            connections: [
              { to: parentLocId, distance: distance }
            ]
          }];
        }
        // Update asset URL on existing location (image may now be ready)
        return prev.map((loc) => loc.id === payload.newLocation.id
          ? { ...loc, asset: finalAsset }
          : loc
        );
      });
    }

    // Update existing Location background and prompt if dynamic update is returned
    if (payload.locationUpdate && payload.locationUpdate.id) {
      console.log('[Client] Overwriting background image and prompt for location:', payload.locationUpdate.id);
      setLocations((prev) => prev.map((loc) => loc.id === payload.locationUpdate.id
        ? { ...loc, asset: payload.locationUpdate.assetUrl, prompt: payload.locationUpdate.prompt }
        : loc
      ));
    }

    // AI controls participant list — trust the returned participantIds fully, including explicit []
    const aiParticipants = Array.isArray(payload.participantIds)
      ? payload.participantIds
      : participantIdsRef.current;
    const cleanParticipants = sanitizeParticipantIds(aiParticipants, mergedNpcs);

    const cleanMessagesRaw = Array.isArray(payload.messages) ? [...payload.messages] : [];
    if (payload.narration) {
      cleanMessagesRaw.unshift({
        speakerId: 'narrator',
        line: payload.narration,
        expression: 'neutral'
      });
    }
    const cleanMessages = sanitizeMessages(cleanMessagesRaw, cleanParticipants);

    setLocationId(cleanLocation);
    locationIdRef.current = cleanLocation;
    setParticipantIds(cleanParticipants);
    participantIdsRef.current = cleanParticipants;
    // Bump bgKey to force the background <img> to remount and re-fetch
    setBgKey((k) => k + 1);

    console.log('[Client] applyConversation - cleanMessages:', cleanMessages);
    setMessages(cleanMessages);
    setNarration(payload.narration || '');

    // Update inventory items
    if (Array.isArray(payload.inventoryDeltas) && payload.inventoryDeltas.length > 0) {
      setInventory((prev) => {
        let updated = [...prev];
        payload.inventoryDeltas.forEach(delta => {
          if (delta.action === 'add') {
            if (!updated.some(item => item.id === delta.id)) {
              updated.push({
                id: delta.id,
                name: delta.name || 'Objeto',
                description: delta.description || ''
              });
              console.log(`[Inventory] Added item: ${delta.name}`);
            }
          } else if (delta.action === 'remove') {
            updated = updated.filter(item => item.id !== delta.id);
            console.log(`[Inventory] Removed item: ${delta.id}`);
          }
        });
        return updated;
      });
    }

    // Update gold
    if (payload.goldDelta && typeof payload.goldDelta === 'number') {
      setGold((prev) => {
        const nextGold = Math.max(0, prev + payload.goldDelta);
        console.log(`[Inventory] Gold changed by ${payload.goldDelta}. New gold: ${nextGold}`);
        return nextGold;
      });
    }

    // Update quests
    if (Array.isArray(payload.questUpdates) && payload.questUpdates.length > 0) {
      setQuests((prev) => {
        return prev.map(q => {
          const update = payload.questUpdates.find(up => up.id === q.id);
          if (update) {
            console.log(`[QuestEngine] Quest ${q.id} updated status to: ${update.status}`);
            
            // Trigger relationship/trust/gold reward if completed
            if (update.status === 'completed' && q.reward) {
              if (q.reward.relationDelta) {
                setRelationships(prevRels => ({
                  ...prevRels,
                  [q.npcId]: Math.min(10, (prevRels[q.npcId] ?? 0) + q.reward.relationDelta)
                }));
              }
              if (q.reward.gold) {
                setGold(prevGold => prevGold + q.reward.gold);
              }
              if (q.reward.item) {
                setInventory(prevInv => {
                  if (!prevInv.some(i => i.id === q.reward.item.id)) {
                    return [...prevInv, q.reward.item];
                  }
                  return prevInv;
                });
              }
            }
            return { ...q, status: update.status };
          }
          return q;
        });
      });
    }
    
    // Update relationship points
    setRelationships((prev) => {
      const next = { ...prev };
      for (const [npcId, delta] of Object.entries(payload.relationshipDeltas || {})) {
        next[npcId] = clampNumber((next[npcId] ?? 0) + Number(delta || 0), -10, 10);
      }
      return next;
    });

    // Update trust points
    setTrust((prev) => {
      const next = { ...prev };
      for (const [npcId, delta] of Object.entries(payload.trustDeltas || {})) {
        next[npcId] = clampNumber((next[npcId] ?? 0) + Number(delta || 0), -10, 10);
      }
      return next;
    });

    // Update event engine states
    if (payload.state) {
      if (payload.state.day !== undefined) {
        setDay(payload.state.day);
        dayRef.current = payload.state.day;
      }
      if (payload.state.time !== undefined) {
        setTime(payload.state.time);
        timeRef.current = payload.state.time;
      }
      if (payload.state.timeOfDay !== undefined) {
        setTimeOfDay(payload.state.timeOfDay);
        timeOfDayRef.current = payload.state.timeOfDay;
      }
      if (payload.state.flags !== undefined) {
        setFlags(payload.state.flags);
        flagsRef.current = payload.state.flags;
      }
      if (payload.state.completedEvents !== undefined) {
        setCompletedEvents(payload.state.completedEvents);
        completedEventsRef.current = payload.state.completedEvents;
      }
      if (payload.state.travelQueue !== undefined) {
        setTravelQueue(payload.state.travelQueue);
        travelQueueRef.current = payload.state.travelQueue;
      }
    }

    // Reset message pointer to 0
    setMessageIndex(0);
  };

  const resetGame = async () => {
    if (!window.confirm('¿Seguro que deseas reiniciar el juego? Se perderá todo el progreso y las memorias.')) {
      return;
    }

    try {
      await fetch('/api/world/reset', { method: 'POST' });
    } catch (err) {
      console.warn('Failed to reset server-side DBs:', err);
    }

    clearGameState();
    setLocationId('plaza');
    locationIdRef.current = 'plaza';
    setParticipantIds([...DEFAULT_PARTICIPANTS]);
    participantIdsRef.current = [...DEFAULT_PARTICIPANTS];
    setMessages([]);
    setMessageIndex(-1);
    setHistory([]);
    setRelationships({});
    setTrust({});
    setBgKey((k) => k + 1);
    setAwaitingPlayer(false);
    setPlayerInputText('');
    setNarration('');
    narrationRef.current = '';
    setInventory([]);
    inventoryRef.current = [];
    setGold(15);
    goldRef.current = 15;
    setQuests([]);
    questsRef.current = [];
    setNpcActivityLog([]);
    npcActivityLogRef.current = [];
    
    // Reset event states
    setDay(1);
    dayRef.current = 1;
    setTime('08:00');
    timeRef.current = '08:00';
    setTimeOfDay('mañana');
    timeOfDayRef.current = 'mañana';
    setFlags([]);
    flagsRef.current = [];
    setCompletedEvents([]);
    completedEventsRef.current = [];

    startConversation('Inicio de escena: los aldeanos reaccionan a la llegada del viajero.', []);
  };

  const getAvailableEvents = () => {
    return events.filter((ev) => {
      // Day check
      if (ev.day !== 0 && ev.day !== day) return false;
      if (ev.day === 0) {
        if (!ev.repeatable || !ev.repeatInterval) return false;
        if (day % ev.repeatInterval !== 0) return false;
      }
      // TimeOfDay check
      if (ev.timeOfDay && ev.timeOfDay !== timeOfDay) return false;
      // Flags check
      if (ev.requiresFlags && ev.requiresFlags.length > 0) {
        const hasAll = ev.requiresFlags.every(f => flags.includes(f));
        if (!hasAll) return false;
      }
      if (ev.excludesIfFlags && ev.excludesIfFlags.length > 0) {
        const hasAny = ev.excludesIfFlags.some(f => flags.includes(f));
        if (hasAny) return false;
      }
      // Completed check
      if (!ev.repeatable && completedEvents.includes(ev.id)) return false;

      return true;
    });
  };

  const triggerEvent = async (ev) => {
    setLoading(true);
    setAwaitingPlayer(false);
    setMessages([]);
    setMessageIndex(-1);
    setTypedText('');
    setIsTyping(false);

    const promptText = `[Evento Especial: ${ev.id}] Inicia la escena para: ${ev.name}. ${ev.description}`;

    const npcIds = ev.involvedNpcs && ev.involvedNpcs.length > 0 ? ev.involvedNpcs : npcs.filter(n => n.locationId === ev.locationId).map(n => n.id);
    setParticipantIds(npcIds);
    participantIdsRef.current = npcIds;

    const newEntry = {
      speakerId: 'narrator',
      speaker: 'Narrador',
      line: `Suceso Especial: ${ev.name}`,
      type: 'player',
      locationId: locationIdRef.current,
      day: dayRef.current,
      time: timeRef.current
    };
    const updatedHistory = [...history, newEntry];
    setHistory(updatedHistory);

    await fetchConversation({
      locationId: ev.locationId || locationId,
      participantIds: npcIds,
      playerText: promptText,
      history: updatedHistory.slice(-60),
      currentRelationships: relationships,
      currentTrust: trust,
      currentNpcs: npcs
    });
  };

  // Typewriter effect logic
  useEffect(() => {
    console.log('[Client] Typewriter useEffect triggered. messageIndex:', messageIndex, 'messages.length:', messages.length);
    if (messageIndex < 0 || messageIndex >= messages.length) {
      setTypedText('');
      setIsTyping(false);
      return;
    }

    const message = messages[messageIndex];
    
    // Update active expression for the speaker (unless it's the narrator)
    if (message.speakerId !== 'narrator') {
      setExpressions((prev) => ({
        ...prev,
        [message.speakerId]: message.expression
      }));
    }

    // Start typewriter
    clearInterval(typingTimerRef.current);
    setTypedText('');
    setIsTyping(true);
    currentLineRef.current = message.line;
    
    let index = 0;
    let accum = '';
    const delayTimeout = setTimeout(() => {
      typingTimerRef.current = setInterval(() => {
        if (index < message.line.length) {
          accum += message.line.charAt(index);
          setTypedText(accum);
          index++;
        } else {
          clearInterval(typingTimerRef.current);
          setIsTyping(false);
          
          // Auto-advance if this is an intermediate travel transition stop
          if (messages.length === 1 && travelQueueRef.current && travelQueueRef.current.length > 0) {
            setTimeout(() => {
              handleAdvanceRef.current();
            }, 1500);
          }
        }
      }, 20); // 20ms per character
    }, 0);

    return () => {
      clearTimeout(delayTimeout);
      clearInterval(typingTimerRef.current);
    };
  }, [messageIndex, messages]);

  // Handle visual novel dialog box interaction (Advance or Skip typewriter)
  const handleAdvance = () => {
    console.log('[Client] handleAdvance - messageIndex:', messageIndex, 'messages.length:', messages.length, 'isTyping:', isTyping, 'loading:', loading);
    if (loading) return;

    if (isTyping) {
      // Skip typewriter animation, display entire text instantly
      clearInterval(typingTimerRef.current);
      setTypedText(currentLineRef.current);
      setIsTyping(false);
      return;
    }

    if (messageIndex + 1 < messages.length) {
      // Advance to next dialog message
      setMessageIndex((prev) => prev + 1);
    } else {
      // Prompt player for reply or continue auto-travel if queue is active
      const currentQueue = travelQueueRef.current || [];
      if (currentQueue.length > 0) {
        const nextLocId = currentQueue[0];
        const remainingQueue = currentQueue.slice(1);
        
        console.log(`[JourneyEngine] Auto-advancing travel queue. Next stop: ${nextLocId}. Remaining: ${remainingQueue.join(', ')}`);
        
        setTravelQueue(remainingQueue);
        travelQueueRef.current = remainingQueue;
        
        setLocationId(nextLocId);
        locationIdRef.current = nextLocId;
        
        const nextNearby = npcs.filter((npc) => getNpcLocation(npc.id, timeOfDay, npc.locationId, npc) === nextLocId);
        const nextParticipants = nextNearby.slice(0, 4).map((npc) => npc.id);
        
        setLoading(true);
        setAwaitingPlayer(false);
        setMessages([]);
        setMessageIndex(-1);
        setTypedText('');
        setIsTyping(false);
        
        const nextLocName = locations.find(l => l.id === nextLocId)?.name || nextLocId;
        const initialText = `Llegada a ${nextLocName} en viaje continuo.`;
        
        fetchConversation({
          locationId: nextLocId,
          participantIds: nextParticipants,
          playerText: initialText,
          currentRelationships: relationshipsRef.current,
          currentTrust: trustRef.current,
          currentNpcs: npcs
        });
      } else {
        setAwaitingPlayer(true);
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 50);
      }
    }
  };

  // Keep ref updated to avoid closure stale state in useEffect
  handleAdvanceRef.current = handleAdvance;


  const handleSuggestionClick = (suggestion) => {
    setPlayerInputText(suggestion);
    if (inputRef.current) inputRef.current.focus();
  };

  // Select current location and active character objects
  const location = locations.find((l) => l.id === locationId) || { name: 'Cargando...', asset: '' };
  const activeMessage = messageIndex >= 0 && messageIndex < messages.length ? messages[messageIndex] : null;
  const activeSpeakerId = activeMessage ? activeMessage.speakerId : null;

  return (
    <div className="app-container">
      {/* Sidebar: Travels, Village Codex and History Log */}
      <aside className="sidebar" aria-label="Tablero de control de la aldea">
        <div className="sidebar-header">
          <h1>Aldea de Robledal</h1>
          <p>Motor Narrativo DM</p>
        </div>

        <div className="provider-selector-container">
          <label className="provider-label">Oráculo Activo</label>
          <div className="provider-options">
            <button
              className={`provider-opt-btn ${provider === 'gemini' ? 'active' : ''} ${!availableProviders.gemini?.available ? 'disabled' : ''}`}
              onClick={() => availableProviders.gemini?.available && setProvider('gemini')}
              disabled={!availableProviders.gemini?.available}
              title={availableProviders.gemini?.available ? `Modelo: ${availableProviders.gemini.model}` : 'No disponible en .env'}
            >
              <span className="provider-name">Gemini</span>
              <span className="provider-model">{availableProviders.gemini?.model ? availableProviders.gemini.model.replace('gemini-', '') : '2.5-flash'}</span>
            </button>
            <button
              className={`provider-opt-btn ${provider === 'openai' ? 'active' : ''} ${!availableProviders.openai?.available ? 'disabled' : ''}`}
              onClick={() => availableProviders.openai?.available && setProvider('openai')}
              disabled={!availableProviders.openai?.available}
              title={availableProviders.openai?.available ? `Modelo: ${availableProviders.openai.model}` : 'No disponible en .env'}
            >
              <span className="provider-name">OpenAI</span>
              <span className="provider-model">{availableProviders.openai?.model || 'gpt-5.5'}</span>
            </button>
          </div>
        </div>

        <div className="time-widget">
          <div className="time-display">
            <span className="time-icon">📅</span>
            <span className="time-text">Día {day}</span>
            <span className="time-divider">•</span>
            <span className="time-icon">🕒</span>
            <span className="time-clock">{time}</span>
          </div>
          <span className={`time-badge time-badge-${timeOfDay}`}>
            {timeOfDay.toUpperCase()}
          </span>
        </div>

        <nav className="sidebar-tabs" aria-label="Navegación del panel">
          <button 
            className={`tab-btn ${activeTab === 'travel' ? 'active' : ''}`}
            onClick={() => setActiveTab('travel')}
          >
            Viajar
          </button>
          <button 
            className={`tab-btn ${activeTab === 'codex' ? 'active' : ''}`}
            onClick={() => setActiveTab('codex')}
          >
            Códice
          </button>
          <button 
            className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Eventos
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Bitácora
          </button>
          <button 
            className={`tab-btn ${activeTab === 'quests' ? 'active' : ''}`}
            onClick={() => setActiveTab('quests')}
          >
            Misiones
          </button>
          <button 
            className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            Bolsa
          </button>
        </nav>

        <div className="tab-content">
          {activeTab === 'travel' && (
            <div className="location-grid">
              {locations.map((loc) => {
                const isCurrent = loc.id === locationId;
                const adjList = CONNECTIONS[locationId] || [];
                const conn = adjList.find(c => c.to === loc.id);
                const isAdjacent = !!conn;
                const travelTime = conn ? conn.distance : null;

                return (
                  <article 
                    key={loc.id} 
                    className={`location-card ${isCurrent ? 'active' : ''} ${!isCurrent && !isAdjacent ? 'locked' : ''}`}
                    style={{
                      opacity: isCurrent || isAdjacent ? 1 : 0.4,
                      cursor: isAdjacent ? 'pointer' : 'default',
                      filter: !isCurrent && !isAdjacent ? 'grayscale(0.6)' : 'none'
                    }}
                    onClick={() => isAdjacent && handleTravel(loc.id)}
                  >
                    {loc.asset && <img src={loc.asset} alt="" className="location-card-bg" />}
                    <div className="location-card-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <h2 className="location-card-title" style={{ margin: 0 }}>{loc.name}</h2>
                        {isCurrent && (
                          <span style={{ fontSize: '0.62rem', background: 'rgba(217, 164, 65, 0.25)', color: 'var(--gold-light)', padding: '0.15rem 0.35rem', borderRadius: '4px', border: '1px solid var(--gold-border)' }}>
                            AQUÍ
                          </span>
                        )}
                        {!isCurrent && isAdjacent && (
                          <span style={{ fontSize: '0.62rem', background: 'rgba(60, 130, 90, 0.25)', color: '#8edba3', padding: '0.15rem 0.35rem', borderRadius: '4px', border: '1px solid var(--green)', whiteSpace: 'nowrap' }}>
                            🕒 {travelTime} min
                          </span>
                        )}
                        {!isCurrent && !isAdjacent && (
                          <span style={{ fontSize: '0.62rem', background: 'rgba(120, 120, 120, 0.25)', color: '#a0a0a0', padding: '0.15rem 0.35rem', borderRadius: '4px', border: '1px solid #707070', whiteSpace: 'nowrap' }}>
                            🔒 BLOQUEADO
                          </span>
                        )}
                      </div>
                      <p className="location-card-desc">{loc.ambient}</p>
                      {npcs.length > 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--gold-light)', marginTop: '0.4rem', opacity: 0.85 }}>
                          👤 {npcs
                            .filter(npc => getNpcLocation(npc.id, timeOfDay, npc.locationId, npc) === loc.id)
                            .map(npc => npc.name.split(' ')[0])
                            .join(', ') || 'Nadie presente'}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === 'codex' && (
            <div className="npc-codex-list">
              {npcs.map((npc) => {
                const isPresent = participantIds.includes(npc.id);
                const relVal = relationships[npc.id]; // can be undefined
                const trustVal = trust[npc.id] ?? 0;
                
                // Map values from -10..10 to 0..100% for progress bar
                const relPct = (((relVal ?? 0) + 10) / 20) * 100;
                const trustPct = ((trustVal + 10) / 20) * 100;

                // Check if traveler has unlocked the secret tone triggers
                const relationshipThresholdUnlocked = (relVal ?? 0) >= 2 || trustVal >= 2;

                const relLabel = getRelationshipLabel(npc.id, relVal, flags);

                return (
                  <article key={npc.id} className={`npc-codex-card ${isPresent ? 'present' : ''}`}>
                    <div className="npc-codex-header" style={{ position: 'relative' }}>
                      <h2 className="npc-codex-name">
                        {npc.name} {isPresent && '•'}
                      </h2>
                      <span className="npc-codex-role">
                        {isPresent 
                          ? `${npc.role} (Aquí)` 
                          : `${npc.role} (En: ${locations.find(l => l.id === getNpcLocation(npc.id, timeOfDay, npc.locationId, npc))?.name || npc.locationId})`}
                      </span>
                      <span className={`relationship-badge rel-badge-${relLabel.toLowerCase().replace(/[^a-zñ]/g, '')}`}>
                        {relLabel}
                      </span>
                    </div>
                    
                    <div className="npc-codex-body">
                      <p style={{ margin: '0 0 0.5rem' }}><strong>Personalidad:</strong> {npc.personality}</p>
                      
                      <div className="npc-goals-box" style={{ margin: '0.6rem 0', padding: '0.5rem 0.65rem', background: 'rgba(0, 0, 0, 0.22)', borderRadius: '6px', border: '1px dashed rgba(212, 175, 55, 0.3)' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gold-light)', fontWeight: 'bold', marginBottom: '0.3rem' }}>🎯 Objetivos de hoy</div>
                        <div style={{ fontSize: '0.72rem', margin: '0.2rem 0', color: '#e8e8e8' }}><strong>A corto plazo:</strong> {npc.shortTermGoal || 'Contactar al Viajero'}</div>
                        <div style={{ fontSize: '0.72rem', margin: '0.2rem 0', color: '#e8e8e8' }}><strong>A largo plazo:</strong> {npc.longTermGoal || 'Cumplir sus deberes en Robledal'}</div>
                        <div style={{ fontSize: '0.72rem', margin: '0.2rem 0 0', color: '#a8a8a8', fontStyle: 'italic' }}><strong>Progreso:</strong> {npc.goalProgress || 'Planeando acciones...'}</div>
                      </div>
                      
                      <div className="npc-stat-row">
                        <span className="npc-stat-label">Relación</span>
                        <div className="npc-stat-bar-container">
                          <div className="npc-stat-bar relationship" style={{ width: `${relPct}%` }}></div>
                        </div>
                        <span className="npc-stat-value">{relVal}</span>
                      </div>

                      <div className="npc-stat-row">
                        <span className="npc-stat-label">Confianza</span>
                        <div className="npc-stat-bar-container">
                          <div className="npc-stat-bar trust" style={{ width: `${trustPct}%` }}></div>
                        </div>
                        <span className="npc-stat-value">{trustVal}</span>
                      </div>

                      {relationshipThresholdUnlocked ? (
                        <div className="npc-secret-box">
                          <div className="npc-secret-title">Secreto Descubierto</div>
                          <p style={{ margin: 0 }}>{npc.secret}</p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--gold-light)' }}>
                            Pista: {npc.hint}
                          </p>
                        </div>
                      ) : (
                        <p style={{ margin: '0.65rem 0 0', fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--muted)' }}>
                          Eleva la relación o confianza a +2 para desbloquear su secreto.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="events-tab-content">
              <section className="events-section">
                <h3>Banderas de Historia (Flags)</h3>
                {flags.length === 0 ? (
                  <p className="no-events-text">Ninguna bandera de historia activa.</p>
                ) : (
                  <div className="flags-list">
                    {flags.map((flag) => (
                      <span key={flag} className="flag-tag">{flag}</span>
                    ))}
                  </div>
                )}
              </section>

              <section className="events-section">
                <h3>Sucesos Disponibles</h3>
                {getAvailableEvents().length === 0 ? (
                  <p className="no-events-text">No hay sucesos especiales disponibles ahora.</p>
                ) : (
                  <div className="events-list">
                    {getAvailableEvents().map((ev) => {
                      const isAtCurrentLocation = ev.locationId === locationId;
                      return (
                        <article key={ev.id} className={`event-card ${isAtCurrentLocation ? 'current-loc' : ''}`}>
                          <div className="event-card-header">
                            <span className={`event-type-badge ${ev.type}`}>{ev.type.toUpperCase()}</span>
                            <h4>{ev.name}</h4>
                          </div>
                          <p className="event-desc">{ev.description}</p>
                          <div className="event-details">
                            <span>📍 {locations.find(l => l.id === ev.locationId)?.name || 'Cualquier lugar'}</span>
                            {ev.timeOfDay && <span>🕒 {ev.timeOfDay}</span>}
                            {ev.day !== 0 && <span>📅 Día {ev.day}</span>}
                          </div>
                          {isAtCurrentLocation ? (
                            <button 
                              className="trigger-event-btn" 
                              onClick={() => triggerEvent(ev)}
                              disabled={loading}
                            >
                              Desencadenar Evento
                            </button>
                          ) : (
                            <div className="event-loc-warning">
                              Viaja a esta ubicación para desencadenar el evento.
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="events-section">
                <h3>Sucesos Completados</h3>
                {completedEvents.length === 0 ? (
                  <p className="no-events-text">Ningún suceso completado aún.</p>
                ) : (
                  <div className="completed-events-list">
                    {completedEvents.map((evtId) => {
                      const ev = events.find(e => e.id === evtId);
                      if (!ev) return <div key={evtId} className="completed-event-item">{evtId}</div>;
                      return (
                        <div key={evtId} className="completed-event-item">
                          <span>✅ {ev.name}</span>
                          <span className="completed-time">Día {ev.day || 'n/a'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              
              <button className="reset-game-btn" onClick={resetGame}>
                Reiniciar Simulación
              </button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-list">
              {history.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', margin: '2rem 0' }}>
                  Aún no hay diálogos registrados en esta sesión.
                </p>
              ) : (
                history.map((item, idx) => (
                  <div key={idx} className="history-item">
                    {item.type === 'narration' ? (
                      <div className="history-item-line narration-style" style={{ fontStyle: 'italic', color: 'var(--muted)', marginBottom: '0.4rem' }}>
                        * {item.line} *
                      </div>
                    ) : (
                      <>
                        <div className={`history-item-speaker ${item.type === 'player' ? 'player' : ''}`}>
                          {item.speaker}
                        </div>
                        <div className={`history-item-line ${item.type === 'player' ? 'player' : ''}`}>
                          {item.line}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'quests' && (
            <div className="quests-tab-content">
              <div className="gold-container">
                <span className="gold-icon">🪙</span>
                <span className="gold-value">{gold} monedas de oro</span>
              </div>
              
              <section className="quests-section" style={{ marginTop: '1rem' }}>
                <h3>Misiones Activas</h3>
                {quests.filter(q => q.status === 'active').length === 0 ? (
                  <p className="no-events-text">No tienes misiones activas en este momento.</p>
                ) : (
                  <div className="quests-list">
                    {quests.filter(q => q.status === 'active').map((q) => {
                      const npc = npcs.find(n => n.id === q.npcId);
                      return (
                        <article key={q.id} className={`quest-card urgency-${q.urgency}`}>
                          <div className="quest-card-header">
                            <span className={`urgency-badge ${q.urgency}`}>
                              {q.urgency.toUpperCase()}
                            </span>
                            <h4>{q.title}</h4>
                          </div>
                          <p className="quest-desc">{q.description}</p>
                          <div className="quest-objective">
                            <strong>Objetivo:</strong> {q.objective}
                          </div>
                          <div className="quest-details">
                            <span>👤 Ofrece: {npc ? npc.name : q.npcId}</span>
                            <span>🪙 Recompensa: {q.reward?.gold || 0} oro</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="quests-section" style={{ marginTop: '1.5rem' }}>
                <h3>Misiones Completadas</h3>
                {quests.filter(q => q.status === 'completed').length === 0 ? (
                  <p className="no-events-text">Ninguna misión completada aún.</p>
                ) : (
                  <div className="completed-quests-list">
                    {quests.filter(q => q.status === 'completed').map((q) => (
                      <div key={q.id} className="completed-quest-item">
                        <span>✅ {q.title}</span>
                        <span className="completed-time">Día {q.dayGenerated}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="inventory-tab-content">
              <div className="gold-container" style={{ marginBottom: '1.2rem' }}>
                <span className="gold-icon">🪙</span>
                <span className="gold-value">{gold} monedas de oro</span>
              </div>
              
              <h3>Bolsa de Viaje</h3>
              {inventory.length === 0 ? (
                <p className="no-events-text">Tu bolsa de viaje está vacía.</p>
              ) : (
                <div className="inventory-grid">
                  {inventory.map((item) => (
                    <article key={item.id} className="inventory-card">
                      <div className="inventory-card-header">
                        <h4>{item.name}</h4>
                      </div>
                      <p className="inventory-card-desc">{item.description}</p>
                      <span className="item-id-badge">{item.id}</span>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className={`vn-viewport ${loading ? 'is-loading' : ''}`} aria-label="Canvas de Novela Visual">
        {/* Background Art — key forces remount so browser re-fetches on location change */}
        {location.asset && (
          <img
            key={bgKey}
            src={location.asset}
            alt={location.name}
            className="vn-background"
          />
        )}
        <div className="vn-vignette"></div>

        {/* Floating status loader */}
        {loading && (
          <div className="loader-overlay">
            <div className="loader-spinner"></div>
            <span>Generando escena...</span>
          </div>
        )}

        {/* Travel queue overlay */}
        {travelQueue && travelQueue.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '1.2rem',
            right: '1.2rem',
            background: 'rgba(20, 20, 20, 0.85)',
            border: '1px solid var(--gold-border)',
            padding: '0.45rem 1rem',
            borderRadius: '6px',
            color: 'var(--gold-light)',
            fontSize: '0.78rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 10
          }}>
            <span>🏃 Viaje Automático en Curso...</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>
              (Quedan {travelQueue.length} paradas hasta tu destino)
            </span>
          </div>
        )}

        {/* Narration banner overlay removed - narration is now displayed inline inside the dialogue box */}

        {/* Character Cast Layer (Hides sprites if narrator is speaking) */}
        <div className="vn-cast-layer">
          {participantIds.map((npcId, index) => {
            const npc = npcs.find((n) => n.id === npcId);
            if (!npc) return null;
            const expression = expressions[npcId] || 'neutral';
            
            // Highlighted if active speaker and NOT narrator
            const isActive = npcId === activeSpeakerId && activeSpeakerId !== 'narrator';

            return (
              <figure 
                key={npcId} 
                className={`npc-sprite ${isActive ? 'active' : 'listening'}`}
                style={{ zIndex: isActive ? 5 : 3 }}
              >
                <img 
                  src={`assets/portraits/${npc.id}-${expression}.png`} 
                  alt={npc.name}
                  className="npc-sprite-img" 
                />
              </figure>
            );
          })}
        </div>

        {/* Subtitle Dialogue Box */}
        {(activeMessage || awaitingPlayer) && (
          <section 
            className="dialogue-box" 
            onClick={!awaitingPlayer ? handleAdvance : undefined}
            aria-live="polite"
          >
            <div className="speaker-container">
              <span className="speaker-name">
                {awaitingPlayer 
                  ? 'Viajero (Tú)' 
                  : (activeMessage?.speakerId === 'narrator' ? 'Narrador' : (npcs.find((n) => n.id === activeMessage?.speakerId)?.name || 'Aldeano'))
                }
              </span>
              {!awaitingPlayer && activeMessage && activeMessage.speakerId !== 'narrator' && (
                <span className="speaker-badge">
                  {npcs.find((n) => n.id === activeMessage.speakerId)?.role}
                </span>
              )}
            </div>

            {!awaitingPlayer ? (
              <>
                <p className={`dialogue-text ${activeMessage?.speakerId === 'narrator' ? 'narrator-style' : ''}`}>
                  {typedText}
                </p>
                {!isTyping && messageIndex + 1 <= messages.length && (
                  <div className="dialogue-continue-arrow" aria-hidden="true"></div>
                )}
              </>
            ) : (
              <form className="reply-form-wrapper" onSubmit={handleSubmitReply} onClick={(e) => e.stopPropagation()}>
                <div className="reply-container">
                  <input
                    ref={inputRef}
                    className="reply-input"
                    value={playerInputText}
                    onChange={(e) => setPlayerInputText(e.target.value)}
                    maxLength="260"
                    placeholder="Escribe tu respuesta..."
                    disabled={loading}
                    autoComplete="off"
                  />
                  <button className="reply-submit-btn" type="submit" disabled={loading || !playerInputText.trim()}>
                    Enviar
                  </button>
                </div>

                {/* Interactive Suggestion Chips */}
                {activeSpeakerId && activeSpeakerId !== 'narrator' && (
                  <div className="suggestions-container">
                    {(npcs.find((n) => n.id === activeSpeakerId)?.suggestions || []).map((sugg, i) => (
                      <button
                        key={i}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleSuggestionClick(sugg)}
                        disabled={loading}
                      >
                        {sugg}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// Helpers
function sanitizeMessages(messages, participantIds) {
  const clean = Array.isArray(messages)
    ? messages
        .map((message) => ({
          speakerId: String(message.speakerId || ''),
          line: String(message.line || '').trim().slice(0, 1200),
          expression: message.expression || 'neutral'
        }))
        .filter((message) => (participantIds.includes(message.speakerId) || message.speakerId === 'narrator') && message.line)
    : [];

  return clean.length ? clean.slice(0, 8) : makeLocalConversation('', participantIds).messages;
}

function sanitizeParticipantIds(ids, currentNpcs) {
  const knownIds = new Set(currentNpcs.map((npc) => npc.id));
  const unique = [...new Set(ids)].filter((id) => knownIds.has(id));
  // If AI returned an empty list just keep the current participants (no forced plaza fallback)
  return unique.slice(0, 4);
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(min, Math.min(max, numeric));
}

function makeLocalConversation(playerText, participantIds) {
  const mentionsSecret = /secreto|recaudador|llave|cartas|molino/i.test(playerText);
  const ids = Array.isArray(participantIds) && participantIds.length >= 2 ? participantIds : ['alcaldesa', 'herrero', 'posadera'];
  
  return {
    locationId: 'plaza',
    participantIds: ids,
    relationshipDeltas: mentionsSecret ? { [ids[0]]: 1, [ids[1]]: -1 } : { [ids[0]]: 1 },
    trustDeltas: mentionsSecret && ids[2] ? { [ids[2]]: 1 } : {},
    messages: [
      {
        speakerId: 'narrator',
        expression: 'neutral',
        line: 'Las voces de la aldea resuenan en respuesta a tus palabras.'
      },
      {
        speakerId: ids[0] || 'alcaldesa',
        expression: mentionsSecret ? 'smirky' : 'neutral',
        line: mentionsSecret
          ? 'Nombras asuntos que no suelen sobrevivir al murmullo de la plaza.'
          : 'Forastero, Robledal no abre sus puertas a cualquiera, pero hoy te escucha.'
      },
      {
        speakerId: ids[1] || ids[0] || 'herrero',
        expression: mentionsSecret ? 'angry' : 'smirky',
        line: mentionsSecret
          ? 'Si alguien vuelve a hablar del molino viejo, que lo haga lejos de mi yunque.'
          : 'Las palabras son blandas. Dinos que haras cuando el hierro empiece a sonar.'
      }
    ].filter((m) => m.speakerId === 'narrator' || ids.includes(m.speakerId))
  };
}
