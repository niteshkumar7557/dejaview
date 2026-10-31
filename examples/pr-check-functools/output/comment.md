<!-- dejaview -->

**📜 DejaView check — 5 past decisions touch this code or proposal**

Historical context is informational; it does not automatically reject this pull request.

### Related accepted architectural decisions

No related accepted decisions were found.

### Previously rejected similar proposals

⚠️ This looks similar to a **previously rejected idea**: “Allow replacing the internal dictionary with a custom subclass to support non\-hashable keys” (functools\.cache should support non\-hashable function arguments via a key arg\.). Reason: You can't subclass cache since it's a function and the relevant functionality, make\_key, isn't available to override\. You therefore need to either fork it, or reimplement\.\.\.; An alternative approach would be to allow replacing \`dict\` with your own subclass\. Then you could do the extension in a general way in the dict's \`\_\_getattr\_\_\` and \`\_\_setattr\_\_\`\.
[View source discussion and decision](<http://localhost:3100/decisions/66>)

⚠️ This looks similar to a **previously rejected idea**: “Use hash of array bytes instead of tuple conversion for efficiency \(rejected due to complexity\)” (functools\.cache should support non\-hashable function arguments via a key arg\.). Reason: For other users, assessing whether to use a cache key\-function is more challenging and treacherous\. For example\.\.\. The cached keys would eat much more memory\.\.\.
[View source discussion and decision](<http://localhost:3100/decisions/67>)

⚠️ This looks similar to a **previously rejected idea**: “Reject key functions with arity greater than one to adhere to existing norms” (functools\.cache should support non\-hashable function arguments via a key arg\.). Reason: And your arity\-two example departs from the existing norm that all key functions are of arity one\.
[View source discussion and decision](<http://localhost:3100/decisions/69>)

⚠️ This looks similar to a **previously rejected idea**: “Reject non\-hashable keys to maintain API simplicity and avoid feature creep” (functools\.cache should support non\-hashable function arguments via a key arg\.). Reason: I'm going to decline\. Mostly, I would like to keep the API simple, avoid feature creep, and not try to be all things to all people\.; I'm going to decline\. Mostly, I would like to the keep the API simple, avoid feature creep, and not try to be all things to all people\.
[View source discussion and decision](<http://localhost:3100/decisions/64>)

⚠️ This looks similar to a **previously rejected idea**: “Make read\-only numpy arrays hashable via a special attribute” (functools\.cache should support non\-hashable function arguments via a key arg\.). Reason: Marking read\-only numpy arrays as hashable sounds like a good feature request\. That does force a change for the caller though\.
[View source discussion and decision](<http://localhost:3100/decisions/65>)

[Open the DejaView dashboard](<http://localhost:3100/>)
