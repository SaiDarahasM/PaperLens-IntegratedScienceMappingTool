// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA__OFybLoWSA6x_8lIyo0Z1Cb2ozhbHoA",
    authDomain: "capstone-project-5f445.firebaseapp.com",
    projectId: "capstone-project-5f445",
    storageBucket: "capstone-project-5f445.firebasestorage.app",
    messagingSenderId: "701976065811",
    appId: "1:701976065811:web:494fa4ea19f04f1dd00ce6",
    measurementId: "G-EVZTJ9X538"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Form Elements
const signUpForm = document.querySelector('.sign-up');
const signInForm = document.querySelector('.sign-in');
const forgotForm = document.querySelector('.forgot-password');

// Sign Up Handler
signUpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const name = document.querySelector('.sign-up input[type="text"]').value;
    const email = document.querySelector('.sign-up input[type="email"]').value;
    const password = document.querySelectorAll('.sign-up input[type="password"]')[0].value;
    const confirmPassword = document.querySelectorAll('.sign-up input[type="password"]')[1].value;

    if (password !== confirmPassword) {
        alert("Passwords don't match!");
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Save to Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Show success message and switch forms
        alert('Account created successfully! Redirecting to login...');
        
        // Trigger sign-in form animation
        wrapper.classList.add('animated-signup');
        wrapper.classList.remove('animated-signin', 'animated-forgot');

    } catch (error) {
        alert(error.message);
        console.error("Signup error:", error);
    }
});

// Animation utility functions
function scatterPapers() {
    // Create paper particles
    for (let i = 0; i < 10; i++) {
        const page = document.createElement('div');
        page.classList.add('page');
        page.style.left = '50%';
        page.style.top = '50%';
        page.style.transform = 'translate(-50%, -50%)';
        page.style.setProperty('--x', `${Math.random() * 800 - 400}px`);
        page.style.setProperty('--y', `${Math.random() * -600}px`);
        page.style.setProperty('--rotate', `${Math.random() * 720 - 360}deg`);
        document.body.appendChild(page);

        setTimeout(() => page.remove(), 3000);
    }
}

function tearPaper() {
    const leftPiece = document.createElement('div');
    leftPiece.classList.add('tear-left');
    leftPiece.style.left = 'calc(50% - 75px)';
    leftPiece.style.top = '50%';
    leftPiece.style.transform = 'translateY(-50%)';
    document.body.appendChild(leftPiece);

    const rightPiece = document.createElement('div');
    rightPiece.classList.add('tear-right');
    rightPiece.style.left = '50%';
    rightPiece.style.top = '50%';
    rightPiece.style.transform = 'translateY(-50%)';
    document.body.appendChild(rightPiece);

    setTimeout(() => {
        leftPiece.remove();
        rightPiece.remove();
    }, 7000);
}

signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.querySelector('.sign-in input[type="email"]').value;
    const password = document.querySelector('.sign-in input[type="password"]').value;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Fetch username from Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        let username = "User";
        if (userDoc.exists) {
            username = userDoc.data().name;
        }

        // Store username and userId in localStorage
        localStorage.setItem("username", username);
        localStorage.setItem("userId", user.uid);

        // Trigger success animation
        scatterPapers();

        // Redirect to home page after animation
        setTimeout(() => {
            window.location.href = "/home";
        }, 2000);

    } catch (error) {
        // Trigger failure animation
        tearPaper();
        console.error("Login error:", error);
       
    }
});

// Password Reset Handler
forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector('.forgot-password input[type="email"]').value;

    try {
        await auth.sendPasswordResetEmail(email);
        alert('Password reset email sent! Check your inbox.');
    } catch (error) {
        alert(error.message);
        console.error("Password reset error:", error);
    }
});

// Form navigation handlers
let wrapper = document.querySelector('.wrapper');
const signUpLink = document.querySelector('.signup-link');
const signInLink = document.querySelector('.signin-link');
const forgotPassLink = document.querySelector('.forgot-pass a');
const backToLoginLink = document.querySelector('.forget-link');

// Set initial animation state
wrapper.classList.add('animated-signup');

// Form switching event listeners
signUpLink.addEventListener('click', () => {
    wrapper.classList.add('animated-signin');
    wrapper.classList.remove('animated-signup', 'animated-forgot');
});

signInLink.addEventListener('click', () => {
    wrapper.classList.add('animated-signup');
    wrapper.classList.remove('animated-signin', 'animated-forgot');
});

forgotPassLink.addEventListener('click', () => {
    wrapper.classList.add('animated-forgot');
    wrapper.classList.remove('animated-signin', 'animated-signup');
});

backToLoginLink.addEventListener('click', () => {
    wrapper.classList.add('animated-signup');
    wrapper.classList.remove('animated-forgot');
});

// Paper falling animation
document.addEventListener("DOMContentLoaded", () => {
    const paperFallContainer = document.querySelector('.paper-fall');
    function createPaper() {
        const paper = document.createElement('div');
        paper.classList.add('paper');

        // Randomize the size of the paper
        const size = Math.random() * 30 + 20; // Between 20px and 50px
        paper.style.width = `${size}px`;
        paper.style.height = `${size}px`;

        // Randomize the position horizontally
        const randomX = Math.random() * window.innerWidth;
        paper.style.left = `${randomX}px`;

        // Randomize the animation duration
        const duration = Math.random() * 5 + 5; // Between 5s and 10s
        paper.style.animationDuration = `${duration}s`;

        // Randomize the rotation
        const rotation = Math.random() * 360;
        paper.style.transform = `rotate(${rotation}deg)`;

        // Append the paper to the container
        paperFallContainer.appendChild(paper);

        // Remove the paper after it falls out of view
        setTimeout(() => {
            paper.remove();
        }, duration * 1000);
    }

    // Create a new paper every 100ms
    setInterval(createPaper, 100);
});