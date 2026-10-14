import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const config = window.FIREBASE_CONFIG || {};
const configured = Boolean(config.apiKey && config.projectId && config.appId && !config.apiKey.startsWith('PASTE_'));

if (configured) {
  const firebaseApp = initializeApp(config);
  const db = getFirestore(firebaseApp);
  window.QUIZ_BACKEND_READY = Promise.resolve({
    configured: true,
    async submitAttempt(attempt) {
      const id = crypto.randomUUID();
      await setDoc(doc(collection(db, 'submissions'), id), {
        studentName: attempt.studentName,
        groupName: attempt.groupName,
        variantId: attempt.variantId,
        answers: attempt.answers,
        submittedAt: serverTimestamp(),
        manualScores: {},
        teacherNote: '',
        gradedAt: null
      });
      return id;
    }
  });
} else {
  window.QUIZ_BACKEND_READY = Promise.resolve({ configured: false });
}
