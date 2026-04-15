/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, Trash2, Book, ExternalLink, Info, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RadixTrie, DictionaryEntry, OperationStep } from "@/src/lib/radix-trie";
import { INITIAL_WORDS } from "@/src/constants/words";
import { TrieVisualizer } from "@/src/components/TrieVisualizer";
import { cn } from "@/src/lib/utils";

const PYTHON_CODE = {
  insert: `class Radix:
    def __init__(self):
        self.root = {}

    # ===== Longest Common Prefix =====
    def _lcp(self, s1, s2):
        i = 0
        while i < min(len(s1), len(s2)) and s1[i] == s2[i]:
            i += 1
        return s1[:i]

    # ===== INSERT =====
    def insert(self, word, node=None):
        if node is None:
            node = self.root

        for key in list(node.keys()):
            prefix = self._lcp(key, word)

            if not prefix:
                continue

            # Case 1: exact match
            if prefix == key and prefix == word:
                return

            # Case 2: key is prefix → go deeper
            if prefix == key:
                self.insert(word[len(prefix):], node[key])
                return

            # Case 3: word is prefix → split node
            if prefix == word:
                node[word] = {key[len(prefix):]: node[key]}
                del node[key]
                return

            # Case 4: partial match → split both
            node[prefix] = {
                key[len(prefix):]: node[key],
                word[len(prefix):]: {}
            }
            del node[key]
            return

        # No match → insert new
        node[word] = {}`,
  search: `    # ===== SEARCH =====
    def search(self, word, node=None):
        if node is None:
            node = self.root

        for key in node:
            if word.startswith(key):
                if word == key:
                    return True
                return self.search(word[len(key):], node[key])

        return False`,
  delete: `    # ===== DELETE =====
    def delete(self, word):
        self._delete(self.root, word)

    def _delete(self, node, word):
        for key in list(node.keys()):
            if word.startswith(key):

                # Case 1: found exact node
                if word == key:
                    del node[key]
                    return True

                # Case 2: go deeper
                child = node[key]
                deleted = self._delete(child, word[len(key):])

                if deleted:
                    # cleanup: merge if only one child
                    if len(child) == 1:
                        subkey = next(iter(child))
                        node[key + subkey] = child[subkey]
                        del node[key]

                    # cleanup: remove empty node
                    elif len(child) == 0:
                        del node[key]

                    return True

        return False`
};

export default function App() {
  const [trie, setTrie] = useState(() => {
    const t = new RadixTrie();
    INITIAL_WORDS.forEach(w => t.insert(w.word, w));
    return t;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<DictionaryEntry | null>(null);
  
  const [newWord, setNewWord] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [newExample, setNewExample] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const [activeCodeTab, setActiveCodeTab] = useState<keyof typeof PYTHON_CODE>("search");
  const [operationSteps, setOperationSteps] = useState<OperationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isAnimating, setIsAnimating] = useState(false);

  const trieData = useMemo(() => trie.toJSON(), [trie]);
  const dictionaryWords = useMemo(() => trie.getAllEntries(), [trie]);

  const runAnimation = (steps: OperationStep[]) => {
    setOperationSteps(steps);
    setCurrentStepIndex(0);
    setIsAnimating(true);
    setHasSearched(true);
  };

  useEffect(() => {
    if (isAnimating && currentStepIndex < operationSteps.length - 1) {
      const timer = setTimeout(() => {
        setCurrentStepIndex(prev => prev + 1);
      }, 800);
      return () => clearTimeout(timer);
    } else if (currentStepIndex === operationSteps.length - 1) {
      setIsAnimating(false);
      if (hasSearched) {
        setTimeout(() => setShowResultOverlay(true), 500);
      }
    }
  }, [isAnimating, currentStepIndex, operationSteps, hasSearched]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = searchQuery.toLowerCase().trim();
    if (!query) return;
    
    setActiveCodeTab("search");
    const { entry, steps } = trie.search(query);
    setSearchResult(entry || null);
    runAnimation(steps);
  };

  const handleReset = () => {
    setHasSearched(false);
    setSearchQuery("");
    setSearchResult(null);
    setOperationSteps([]);
    setCurrentStepIndex(-1);
    setShowResultOverlay(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const word = newWord.toLowerCase().trim();
    if (!word || !newMeaning) return;

    const entry: DictionaryEntry = {
      word,
      meaning: newMeaning,
      oxfordLink: `https://www.oxfordlearnersdictionaries.com/definition/english/${word}`,
      example: newExample
    };

    setActiveCodeTab("insert");
    const steps = trie.insert(word, entry);
    setTrie(Object.assign(Object.create(Object.getPrototypeOf(trie)), trie)); // Force re-render
    runAnimation(steps);
    
    setNewWord("");
    setNewMeaning("");
    setNewExample("");
    setFetchError("");
    setShowAddModal(false);
  };

  const fetchDefinition = async () => {
    const word = newWord.trim().toLowerCase();
    if (!word) return;

    setIsFetching(true);
    setFetchError("");
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!response.ok) throw new Error("Word not found");
      
      const data = await response.json();
      const firstEntry = data[0];
      const firstMeaning = firstEntry.meanings[0];
      const firstDefinition = firstMeaning.definitions[0];

      setNewMeaning(firstDefinition.definition);
      setNewExample(firstDefinition.example || "");
    } catch (err) {
      setFetchError("Could not find definition automatically.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleDelete = (word: string) => {
    setActiveCodeTab("delete");
    const { success, steps } = trie.delete(word);
    if (success) {
      setTrie(Object.assign(Object.create(Object.getPrototypeOf(trie)), trie)); // Force re-render
      if (searchResult?.word === word) setSearchResult(null);
    }
    runAnimation(steps);
  };

  const handleWordClick = (word: string) => {
    setSearchQuery(word);
    const { entry, steps } = trie.search(word);
    if (entry) {
      setSearchResult(entry);
      setHasSearched(true);
      runAnimation(steps);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfcfb] text-[#2d2d2d] font-mono selection:bg-[#00f2ff] selection:text-black">
      {/* Top Navigation */}
      <nav className="max-w-[1600px] mx-auto px-8 py-6 flex items-center justify-between border-b border-[#2d2d2d]/10 mb-8">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={handleReset}>
          <div className="w-10 h-10 bg-[#2d2d2d] flex items-center justify-center rounded-full group-hover:bg-[#00f2ff] transition-all duration-500">
            <Book className="text-[#00f2ff] group-hover:text-black transition-all duration-500" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter uppercase">Radix</h1>
          </div>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-8 py-3 bg-[#2d2d2d] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#00f2ff] hover:text-black transition-all rounded-full shadow-lg shadow-black/5 active:translate-y-0.5"
        >
          Add New Entry
        </button>
      </nav>

      <main className="max-w-[1600px] mx-auto px-8 pb-20">
        {/* Hero Search Section */}
        <motion.section 
          layout
          className={cn(
            "max-w-3xl mx-auto transition-all duration-700",
            hasSearched ? "mb-12" : "mt-20 mb-16 text-center"
          )}
        >
          {!hasSearched && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12 relative"
            >
            <h2 className="text-6xl font-black tracking-tighter uppercase mb-6">
              Dictionary With <span className="text-[#00f2ff]">Radix Tree</span>
            </h2>
              <p className="text-base text-[#6a6a6a] leading-relaxed max-w-xl mx-auto font-medium">
                Visualize high-speed dictionary lookups powered by Radix Tries.
              </p>
            </motion.div>
          )}
          
          <form onSubmit={handleSearch} className="w-full relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00f2ff] to-[#ff00ff] rounded-full blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
            <div className="relative flex items-center bg-white border border-[#2d2d2d]/10 rounded-full overflow-hidden shadow-sm focus-within:border-[#00f2ff] transition-all">
              <div className="pl-8 text-[#a8a4a1]">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ENTER QUERY..."
                className="w-full px-6 py-6 text-xl font-bold outline-none placeholder:text-[#e8e4e1] uppercase tracking-widest"
              />
              <button 
                type="submit"
                className="px-10 py-6 bg-[#2d2d2d] text-[#00f2ff] font-black uppercase tracking-widest hover:bg-[#00f2ff] hover:text-black transition-all"
              >
                RUN
              </button>
            </div>
          </form>

          {!hasSearched && (
            <div className="mt-16 grid grid-cols-3 gap-8 w-full">
              {[
                { label: "Complexity", val: "O(k)", desc: "k = key length" },
                { label: "Optimization", val: "Radix", desc: "Path compressed" },
                { label: "State", val: "Live", desc: "Real-time render" }
              ].map((stat, i) => (
                <div key={i} className="p-8 border border-[#2d2d2d]/5 rounded-[2rem] hover:border-[#00f2ff]/30 transition-all group bg-white/50">
                  <div className="text-[9px] font-bold text-[#a8a4a1] uppercase tracking-widest mb-3 group-hover:text-[#00f2ff]">{stat.label}</div>
                  <div className="text-2xl font-black mb-1">{stat.val}</div>
                  <div className="text-[9px] text-[#a8a4a1] font-bold uppercase tracking-tighter">{stat.desc}</div>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        <AnimatePresence>
          {hasSearched && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {/* Visualization Column */}
                <motion.div 
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-8"
                >
                  <section className="bg-white border border-[#2d2d2d]/10 rounded-[2.5rem] overflow-hidden shadow-sm relative group flex flex-col h-full">
                    <div className="p-6 border-b border-[#2d2d2d]/5 flex items-center justify-between bg-[#fafafa]">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#00f2ff] animate-pulse"></div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#a8a4a1]">Visualization</span>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-h-[450px] bg-[#fdfcfb] p-4 relative">
                      <TrieVisualizer 
                        data={trieData} 
                        activeNodeId={currentStepIndex >= 0 ? operationSteps[currentStepIndex].nodeId : undefined} 
                      />
                      
                      {/* Step Description Overlay */}
                      <AnimatePresence>
                        {currentStepIndex >= 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="absolute bottom-8 left-8 right-8 bg-[#2d2d2d] text-white p-6 shadow-2xl rounded-2xl border-b-4 border-[#00f2ff]"
                          >
                            <div className="flex items-start gap-4">
                              <div className="p-2 bg-[#00f2ff]/10 rounded text-[#00f2ff]">
                                <Info size={18} />
                              </div>
                              <div>
                                <div className="text-[9px] font-bold text-[#00f2ff] uppercase tracking-widest mb-1">Step {currentStepIndex + 1} / {operationSteps.length}</div>
                                <p className="text-sm font-bold leading-relaxed">{operationSteps[currentStepIndex].description}</p>
                                <div className="mt-3 flex items-center gap-3">
                                  <span className="text-[9px] text-[#a8a4a1] uppercase font-bold tracking-tighter">Buffer:</span>
                                  <span className="text-xs font-mono bg-black/40 px-3 py-1 rounded text-[#ff00ff]">{operationSteps[currentStepIndex].remainingWord || "NULL"}</span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>
                </motion.div>

                {/* Python Code Viewer Column */}
                <motion.div 
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <section className="bg-[#1a1a1a] border border-[#2d2d2d]/10 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col h-full">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#2d2d2d]">
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Implementation</span>
                      </div>
                      <div className="flex bg-black/30 p-1 rounded-full">
                        {(["insert", "search", "delete"] as const).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveCodeTab(tab)}
                            className={cn(
                              "px-5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-full transition-all",
                              activeCodeTab === tab ? "bg-[#00f2ff] text-black" : "text-white/30 hover:text-white"
                            )}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-8 text-[#e8e4e1] font-mono text-[11px] overflow-x-auto custom-scrollbar flex-1 bg-black/10">
                      <pre className="space-y-1.5">
                        {PYTHON_CODE[activeCodeTab].split("\n").map((line, idx) => {
                          const isHighlighted = currentStepIndex >= 0 && operationSteps[currentStepIndex].lineIndex === idx + 1;
                          return (
                            <div 
                              key={idx} 
                              className={cn(
                                "px-3 py-1 rounded-lg transition-all flex gap-6",
                                isHighlighted ? "bg-[#00f2ff]/10 border-l-2 border-[#00f2ff] text-white" : "opacity-30"
                              )}
                            >
                              <span className="inline-block w-4 text-white/10 text-right select-none">{idx + 1}</span>
                              <span className="whitespace-pre">{line}</span>
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  </section>
                </motion.div>
              </div>

              {/* Dictionary Words List */}
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="max-w-6xl mx-auto px-4 pt-12"
              >
                <div className="flex items-center justify-between mb-10 pb-6 border-b border-[#2d2d2d]/10">
                  <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-4">
                    Stored Words
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-[9px] font-bold text-[#a8a4a1] uppercase tracking-widest bg-white border border-[#2d2d2d]/5 px-4 py-2 rounded-full">
                      <span className="text-[#00f2ff]">{dictionaryWords.length}</span> Total
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {dictionaryWords.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white border border-dashed border-[#2d2d2d]/10 rounded-[2.5rem]">
                      <p className="text-[#a8a4a1] text-[10px] font-bold uppercase tracking-widest">Registry is empty</p>
                    </div>
                  )}
                  {dictionaryWords.map(entry => (
                    <motion.div 
                      key={entry.word}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => handleWordClick(entry.word)}
                      className="group bg-white border border-[#2d2d2d]/10 p-6 rounded-[2rem] hover:border-[#00f2ff] hover:shadow-xl hover:shadow-[#00f2ff]/5 transition-all relative overflow-hidden cursor-pointer"
                    >
                      <div className="absolute top-0 right-0 w-10 h-10 bg-[#fdfcfb] border-l border-b border-[#2d2d2d]/10 flex items-center justify-center group-hover:bg-[#00f2ff] group-hover:border-[#00f2ff] transition-colors rounded-bl-2xl">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.word);
                          }}
                          className="text-[#a8a4a1] group-hover:text-black transition-colors"
                          title="Purge"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-lg font-black text-[#2d2d2d] uppercase tracking-tighter mb-2 group-hover:text-[#00f2ff] transition-colors">{entry.word}</span>
                        <span className="text-[9px] text-[#a8a4a1] font-bold uppercase tracking-widest leading-relaxed line-clamp-2">
                          {entry.meaning}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Result Overlay */}
      <AnimatePresence>
        {showResultOverlay && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResultOverlay(false)}
              className="absolute inset-0 bg-[#1a1a1a]/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl"
            >
              {searchResult ? (
                <section className="bg-white border border-[#2d2d2d]/10 p-12 relative overflow-hidden shadow-2xl rounded-[3rem]">
                  <div className="absolute top-0 right-0 p-6 flex gap-4">
                    <button 
                      onClick={() => {
                        handleDelete(searchResult.word);
                        setShowResultOverlay(false);
                      }}
                      className="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded-full"
                      title="Remove"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button 
                      onClick={() => setShowResultOverlay(false)}
                      className="w-12 h-12 flex items-center justify-center bg-[#fdfcfb] text-[#2d2d2d] hover:bg-[#2d2d2d] hover:text-white transition-all rounded-full"
                    >
                      <Plus className="rotate-45" size={24} />
                    </button>
                  </div>

                  <div className="mb-10">
                    <span className="text-[9px] font-black text-[#00f2ff] uppercase tracking-[0.3em] mb-4 block">Entry Found</span>
                    <h2 className="text-6xl font-black text-[#2d2d2d] uppercase tracking-tighter mb-4">{searchResult.word}</h2>
                    <div className="w-20 h-1.5 bg-[#00f2ff] rounded-full"></div>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <h3 className="text-[10px] font-black text-[#a8a4a1] uppercase tracking-widest mb-3">Definition</h3>
                      <p className="text-2xl font-bold text-[#2d2d2d] leading-tight uppercase">{searchResult.meaning}</p>
                    </div>

                    {searchResult.example && (
                      <div className="p-6 bg-[#fdfcfb] rounded-2xl border border-[#2d2d2d]/5 italic">
                        <h3 className="text-[10px] font-black text-[#a8a4a1] uppercase tracking-widest mb-2 not-italic">Context</h3>
                        <p className="text-[#6a6a6a] text-lg font-medium">"{searchResult.example}"</p>
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <div className="bg-white border border-[#2d2d2d]/10 p-16 text-center shadow-2xl relative rounded-[3rem]">
                  <button 
                    onClick={() => setShowResultOverlay(false)}
                    className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-[#fdfcfb] text-[#2d2d2d] hover:bg-[#2d2d2d] hover:text-white transition-all rounded-full"
                  >
                    <Plus className="rotate-45" size={24} />
                  </button>
                  <AlertCircle className="text-[#ff00ff] mx-auto mb-8" size={64} />
                  <p className="text-4xl font-black text-[#2d2d2d] uppercase tracking-tighter">Not Found</p>
                  <p className="text-[#6a6a6a] text-lg mt-6 font-bold">The requested word does not exist in the index.</p>
                  <button 
                    onClick={() => setShowResultOverlay(false)}
                    className="mt-12 px-10 py-4 bg-[#2d2d2d] text-[#00f2ff] font-black uppercase text-xs tracking-widest hover:bg-[#00f2ff] hover:text-black transition-all rounded-full"
                  >
                    Back to Search
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Word Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-[#1a1a1a]/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="relative bg-white w-full max-w-xl border border-[#2d2d2d]/10 shadow-2xl p-12 overflow-hidden rounded-[3rem]"
            >
              <h2 className="text-3xl font-black uppercase tracking-tighter text-[#2d2d2d] mb-10">Add Entry</h2>
              
              <form onSubmit={handleAdd} className="space-y-8">
                <div>
                  <label className="block text-[9px] font-black text-[#a8a4a1] uppercase tracking-[0.3em] mb-3">Word</label>
                  <div className="flex gap-4">
                    <input
                      autoFocus
                      type="text"
                      required
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      placeholder="e.g. ALGORITHM"
                      className="flex-1 px-6 py-4 bg-[#fdfcfb] border border-[#2d2d2d]/10 focus:border-[#00f2ff] outline-none transition-all text-lg font-bold uppercase rounded-2xl"
                    />
                    <button
                      type="button"
                      onClick={fetchDefinition}
                      disabled={isFetching || !newWord.trim()}
                      className="px-6 bg-[#2d2d2d] text-[#00f2ff] hover:bg-[#00f2ff] hover:text-black disabled:opacity-50 transition-all flex items-center justify-center rounded-2xl"
                    >
                      {isFetching ? <Loader2 className="animate-spin" size={24} /> : <Sparkles size={24} />}
                    </button>
                  </div>
                  {fetchError && <p className="text-[9px] text-red-500 mt-2 font-bold uppercase tracking-widest">{fetchError}</p>}
                </div>
                
                <div>
                  <label className="block text-[9px] font-black text-[#a8a4a1] uppercase tracking-[0.3em] mb-3">Meaning</label>
                  <textarea
                    required
                    rows={4}
                    value={newMeaning}
                    onChange={(e) => setNewMeaning(e.target.value)}
                    placeholder="ENTER DEFINITION..."
                    className="w-full px-6 py-4 bg-[#fdfcfb] border border-[#2d2d2d]/10 focus:border-[#00f2ff] outline-none transition-all resize-none text-lg font-bold uppercase rounded-2xl"
                  />
                </div>
                
                <div>
                  <label className="block text-[9px] font-black text-[#a8a4a1] uppercase tracking-[0.3em] mb-3">Example</label>
                  <input
                    type="text"
                    value={newExample}
                    onChange={(e) => setNewExample(e.target.value)}
                    placeholder="OPTIONAL EXAMPLE..."
                    className="w-full px-6 py-4 bg-[#fdfcfb] border border-[#2d2d2d]/10 focus:border-[#00f2ff] outline-none transition-all text-lg font-bold uppercase rounded-2xl"
                  />
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-8 py-4 border border-[#2d2d2d]/10 text-[#2d2d2d] font-black uppercase text-[10px] tracking-widest hover:bg-[#f5f5f0] transition-all rounded-full"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-8 py-4 bg-[#2d2d2d] text-[#00f2ff] font-black uppercase text-[10px] tracking-widest hover:bg-[#00f2ff] hover:text-black transition-all rounded-full shadow-lg shadow-black/5 active:translate-y-0.5"
                  >
                    Save Entry
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
