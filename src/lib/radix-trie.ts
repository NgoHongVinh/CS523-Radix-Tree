/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DictionaryEntry {
  word: string;
  meaning: string;
  oxfordLink?: string;
  example?: string;
}

export interface OperationStep {
  nodeId: string;
  lineIndex: number;
  description: string;
  remainingWord: string;
}

export class RadixNode {
  label: string;
  children: Map<string, RadixNode>;
  entry?: DictionaryEntry;
  id: string = ""; // Added for stable ID tracking

  constructor(label: string, entry?: DictionaryEntry) {
    this.label = label;
    this.children = new Map();
    this.entry = entry;
  }
}

export class RadixTrie {
  root: RadixNode;

  constructor() {
    this.root = new RadixNode("");
    this.assignIds();
  }

  private assignIds() {
    let counter = 0;
    const traverse = (node: RadixNode, id: string) => {
      node.id = id;
      Array.from(node.children.entries()).forEach(([_, child], index) => {
        traverse(child, `${id}-${index}`);
      });
    };
    traverse(this.root, "root");
  }

  insert(word: string, entry: DictionaryEntry): OperationStep[] {
    const steps: OperationStep[] = [];
    let curr = this.root;
    let i = 0;

    steps.push({ nodeId: curr.id, lineIndex: 14, description: "Start insertion at root", remainingWord: word });

    while (i < word.length) {
      let found = false;
      steps.push({ nodeId: curr.id, lineIndex: 17, description: `Processing: ${word.substring(i)}`, remainingWord: word.substring(i) });
      
      for (const [label, child] of curr.children) {
        steps.push({ nodeId: curr.id, lineIndex: 18, description: `Checking child with label: ${label}`, remainingWord: word.substring(i) });
        const commonPrefix = this.getCommonPrefix(word.substring(i), label);

        if (commonPrefix.length > 0) {
          found = true;
          if (commonPrefix === label) {
            steps.push({ nodeId: child.id, lineIndex: 28, description: "Full label match, moving to child", remainingWord: word.substring(i + commonPrefix.length) });
            curr = child;
            i += commonPrefix.length;
            break;
          } else {
            const remainingLabel = label.substring(commonPrefix.length);
            const remainingWord = word.substring(i + commonPrefix.length);

            if (remainingWord.length === 0) {
              steps.push({ nodeId: curr.id, lineIndex: 33, description: "Word is prefix, splitting node", remainingWord: word.substring(i) });
              const newNode = new RadixNode(commonPrefix, entry);
              curr.children.delete(label);
              curr.children.set(commonPrefix, newNode);
              child.label = remainingLabel;
              newNode.children.set(remainingLabel, child);
            } else {
              steps.push({ nodeId: curr.id, lineIndex: 39, description: "Partial match, splitting both", remainingWord: word.substring(i) });
              const newNode = new RadixNode(commonPrefix);
              curr.children.delete(label);
              curr.children.set(commonPrefix, newNode);
              child.label = remainingLabel;
              newNode.children.set(remainingLabel, child);
              const leaf = new RadixNode(remainingWord, entry);
              newNode.children.set(remainingWord, leaf);
            }
            this.assignIds();
            return steps;
          }
        }
      }

      if (!found) {
        steps.push({ nodeId: curr.id, lineIndex: 47, description: "No match found, creating new leaf", remainingWord: word.substring(i) });
        const newNode = new RadixNode(word.substring(i), entry);
        curr.children.set(word.substring(i), newNode);
        this.assignIds();
        return steps;
      }
    }

    steps.push({ nodeId: curr.id, lineIndex: 24, description: "Exact match found, updating entry", remainingWord: "" });
    curr.entry = entry;
    this.assignIds();
    return steps;
  }

  delete(word: string): { success: boolean; steps: OperationStep[] } {
    const steps: OperationStep[] = [];
    const success = this._delete(this.root, word, 0, steps);
    this.assignIds();
    return { success, steps };
  }

  private _delete(curr: RadixNode, word: string, i: number, steps: OperationStep[]): boolean {
    steps.push({ nodeId: curr.id, lineIndex: 5, description: `Visiting node, remaining: ${word.substring(i)}`, remainingWord: word.substring(i) });
    
    if (i === word.length) {
      if (curr.entry) {
        steps.push({ nodeId: curr.id, lineIndex: 11, description: "Word found, removing entry", remainingWord: "" });
        delete curr.entry;
        this.maybeMerge(curr);
        return true;
      }
      return false;
    }

    for (const [label, child] of curr.children) {
      if (word.substring(i).startsWith(label)) {
        steps.push({ nodeId: curr.id, lineIndex: 7, description: `Matching label: ${label}`, remainingWord: word.substring(i) });
        const deleted = this._delete(child, word, i + label.length, steps);
        if (deleted) {
          steps.push({ nodeId: curr.id, lineIndex: 18, description: "Cleanup and merge check", remainingWord: "" });
          if (child.children.size === 0 && !child.entry) {
            curr.children.delete(label);
          }
          this.maybeMerge(curr);
          return true;
        }
      }
    }
    return false;
  }

  private maybeMerge(node: RadixNode) {
    if (node === this.root) return;
    if (node.children.size === 1 && !node.entry) {
      const [label, child] = node.children.entries().next().value;
      node.label += label;
      node.entry = child.entry;
      node.children = child.children;
    }
  }

  search(word: string): { entry?: DictionaryEntry; steps: OperationStep[] } {
    const steps: OperationStep[] = [];
    let curr = this.root;
    let i = 0;

    steps.push({ nodeId: curr.id, lineIndex: 2, description: "Start search at root", remainingWord: word });

    while (i < word.length) {
      let found = false;
      steps.push({ nodeId: curr.id, lineIndex: 6, description: `Looking for: ${word.substring(i)}`, remainingWord: word.substring(i) });
      
      for (const [label, child] of curr.children) {
        steps.push({ nodeId: curr.id, lineIndex: 7, description: `Checking edge: ${label}`, remainingWord: word.substring(i) });
        if (word.substring(i).startsWith(label)) {
          steps.push({ nodeId: child.id, lineIndex: 10, description: `Matched label: ${label}`, remainingWord: word.substring(i + label.length) });
          curr = child;
          i += label.length;
          found = true;
          break;
        }
      }
      if (!found) {
        steps.push({ nodeId: curr.id, lineIndex: 12, description: "No matching edge found", remainingWord: word.substring(i) });
        return { steps };
      }
    }

    steps.push({ nodeId: curr.id, lineIndex: 9, description: curr.entry ? "Word found!" : "Prefix found, but not a word", remainingWord: "" });
    return { entry: i === word.length ? curr.entry : undefined, steps };
  }

  private getCommonPrefix(s1: string, s2: string): string {
    let i = 0;
    while (i < s1.length && i < s2.length && s1[i] === s2[i]) {
      i++;
    }
    return s1.substring(0, i);
  }

  // Helper for visualization
  toJSON() {
    return this._toJSON(this.root, "root");
  }

  private _toJSON(node: RadixNode, id: string): any {
    return {
      id,
      label: node.label || "root",
      isWord: !!node.entry,
      entry: node.entry,
      children: Array.from(node.children.entries()).map(([label, child], index) => 
        this._toJSON(child, `${id}-${index}`)
      )
    };
  }

  getAllEntries(): DictionaryEntry[] {
    const entries: DictionaryEntry[] = [];
    const traverse = (node: RadixNode) => {
      if (node.entry) entries.push(node.entry);
      for (const child of node.children.values()) {
        traverse(child);
      }
    };
    traverse(this.root);
    return entries;
  }
}
