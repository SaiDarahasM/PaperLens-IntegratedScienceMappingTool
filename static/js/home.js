const getLocalUser = localStorage.getItem("username");
if (getLocalUser) {
  document.getElementById("userProfile").innerHTML = `${getLocalUser}`;
} else {
  document.getElementById("userProfile").innerHTML = "";
}

function populateYearDropdown(startYear, endYear) {
  const dropdown = document.getElementById('year-filter');

  // Clear existing options (except the first default option)
  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }

  // Add years dynamically
  for (let year = endYear; year >= startYear; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    dropdown.appendChild(option);
  }
}

// Populate the dropdown with years from 1900 to 2025
populateYearDropdown(1900, 2025);

const profileContainer = document.getElementById("profileContainer");
const signInBtn = document.getElementById("signInBtn");
const storedUsername = localStorage.getItem("username");
const storedUserId = localStorage.getItem("userId")

if (storedUsername) {
  profileContainer.style.display = "flex";
  signInBtn.style.display = "none";
} else {
  profileContainer.style.display = "none";
  signInBtn.style.display = "block";
}

// Elements for profile dropdown and overlay
const userProfile = document.getElementById("userProfile");
const profileDropdown = document.getElementById("profileDropdown");
const profileOverlay = document.getElementById("profileOverlay");
const logoutBtn = document.getElementById("logoutBtn");

// Toggle dropdown on clicking profile trigger
userProfile.addEventListener("click", () => {
  profileDropdown.classList.add("active");
  profileOverlay.classList.add("active");
});

// Close dropdown when clicking outside
profileOverlay.addEventListener("click", () => {
  profileDropdown.classList.remove("active");
  profileOverlay.classList.remove("active");
});

async function saveSearchToFirebase(query, year, feature) {
  const auth = firebase.auth();
  const db = firebase.firestore();
  const user = auth.currentUser;
  if (!user) {
    console.log("User not logged in, cannot save search history");
    return;
  }
  
  try {
    // Create search activity object
    const searchData = {
      type: "search",
      query: query,
      year: year || "All Years",
      feature: feature,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to Firestore
    await db.collection("users")
      .doc(user.uid)
      .collection("activities")
      .add(searchData);
      
    console.log("Search activity saved successfully");
  } catch (error) {
    console.error("Error saving search activity:", error);
  }
}


document.addEventListener("DOMContentLoaded", async () => {
  // Input fields for personal info
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profilePhone = document.getElementById("profilePhone");
  const profileAddress = document.getElementById("profileAddress");
  const profileProfession = document.getElementById("profileProfession");
  const profileHeaderName = document.getElementById("profileHeaderName");

  // Firebase Auth & Firestore setup
  const auth = firebase.auth();
  const db = firebase.firestore();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const userId = user.uid;

      // Load saved personal info from localStorage
      profileName.value = localStorage.getItem("username") || "";
      profilePhone.value = localStorage.getItem("phone") || "";
      profileAddress.value = localStorage.getItem("address") || "";
      profileProfession.value = localStorage.getItem("profession") || "";
      profileHeaderName.innerHTML = `Welcome, ${storedUsername}`;



      try {
        // Fetch additional user details from Firestore
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (!profileName.value) profileName.value = userData.name || "";
          if (!profilePhone.value) profilePhone.value = userData.phone || "";
          if (!profileAddress.value) profileAddress.value = userData.address || "";
          if (!profileProfession.value) profileProfession.value = userData.profession || "";
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    }
  });

  // Enable editing for profile fields
  window.enableEdit = (fieldId) => {
    const inputField = document.getElementById(fieldId);
    inputField.removeAttribute("disabled");
    inputField.focus();
    inputField.addEventListener("blur", () => {
      // When leaving, set back to readonly (or disabled if you prefer)
      inputField.setAttribute("disabled", true);
    });
  };

  // Tab switching for profile dropdown
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`${tab}-tab`).classList.add("active");
    });
  });

  // Avatar upload preview
  const avatarUpload = document.getElementById("avatarUpload");
  const profileAvatar = document.getElementById("profileAvatar");

  if (avatarUpload) {
    avatarUpload.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          profileAvatar.src = event.target.result;
          // (Optional) Save the avatar image to your storage if needed
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Save profile details and preferences
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("No user logged in!");
      return;
    }
    const userId = user.uid;

    // Gather updated personal info
    const updatedName = profileName.value.trim();
    const updatedPhone = profilePhone.value.trim();
    const updatedAddress = profileAddress.value.trim();
    const updatedProfession = profileProfession.value.trim();

    // Save personal info in localStorage
    localStorage.setItem("username", updatedName);
    localStorage.setItem("phone", updatedPhone);
    localStorage.setItem("address", updatedAddress);
    localStorage.setItem("profession", updatedProfession);

    // Store personal info in Firestore
    try {
      await db.collection("users").doc(userId).set(
        {
          name: updatedName,
          phone: updatedPhone,
          address: updatedAddress,
          profession: updatedProfession,
          
        },
        { merge: true }
      );
      userProfile.textContent = updatedName; // Update navbar username
      showPaperAlert(
        "Successfully Updated!", 
        "Profile Updation Status",
        "fa-exclamation-circle", 
        4000
      );
    } catch (error) {
      console.error("Error updating profile:", error);
      showPaperAlert(
        "Error in Updation", 
        "Profile Updation Status",
        "fa-exclamation-circle", 
        4000
      );
    }
  });

  // Logout functionality
  logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      localStorage.clear();
      window.location.href = "/home";
    } catch (error) {
      console.error("Logout error:", error);
    }
  });
});
// Paper animation class
class Paper {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 15 + 5;
    this.rotation = Math.random() * 360;
    this.speedX = Math.random() * 3 - 1.5;
    this.speedY = Math.random() * 3 - 1.5;
    this.rotationSpeed = Math.random() * 2 - 1;
    this.opacity = 1;
    this.life = 100;
    this.element = document.createElement('div');
    this.element.className = 'paper';
    this.element.style.width = `${this.size}px`;
    this.element.style.height = `${this.size}px`;
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    this.element.style.transform = `rotate(${this.rotation}deg)`;
    this.element.style.opacity = this.opacity;
    document.body.appendChild(this.element);
  }

  update() {
    this.life--;
    this.x += this.speedX;
    this.y += this.speedY;
    this.rotation += this.rotationSpeed;
    this.opacity = this.life / 100;
    
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    this.element.style.transform = `rotate(${this.rotation}deg)`;
    this.element.style.opacity = this.opacity;
    
    if (this.life <= 0) {
      this.element.remove();
      return false;
    }
    return true;
  }
}

// Paper animation
let papers = [];
let frameCount = 0;

document.addEventListener('mousemove', (e) => {
  if (frameCount % 2 === 0) {
    papers.push(new Paper(e.clientX, e.clientY));
  }
});

function animate() {
  frameCount++;
  papers = papers.filter(paper => paper.update());
  requestAnimationFrame(animate);
}

animate();

// Beam connections animation
document.addEventListener('DOMContentLoaded', () => {
  // Get references to all circles
  const container = document.getElementById('beam-container');
  const circle1 = document.getElementById('circle1');
  const circle2 = document.getElementById('circle2');
  const circle3 = document.getElementById('circle3');
  const circle4 = document.getElementById('circle4');
  const circle5 = document.getElementById('circle5');
  const circle6 = document.getElementById('circle6');
  const circle7 = document.getElementById('circle7');
  
  // Get SVG container
  const svgContainer = document.getElementById('beams-svg');
  
  // Create beam connections
  createBeam(circle1, circle6);
  createBeam(circle2, circle6);
  createBeam(circle3, circle6);
  createBeam(circle4, circle6);
  createBeam(circle5, circle6);
  createBeam(circle6, circle7);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    // Clear existing beams
    svgContainer.innerHTML = '';
    
    // Recreate beams
    createBeam(circle1, circle6);
    createBeam(circle2, circle6);
    createBeam(circle3, circle6);
    createBeam(circle4, circle6);
    createBeam(circle5, circle6);
    createBeam(circle6, circle7);
  });
  
  // Function to create an animated beam between two elements
  function createBeam(fromElement, toElement) {
    // Get positions
    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Calculate center points relative to the container
    const fromX = fromRect.left + fromRect.width / 2 - containerRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - containerRect.top;
    const toX = toRect.left + toRect.width / 2 - containerRect.left;
    const toY = toRect.top + toRect.height / 2 - containerRect.top;
    
    // Create the base beam line
    const beam = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    beam.setAttribute('x1', fromX);
    beam.setAttribute('y1', fromY);
    beam.setAttribute('x2', toX);
    beam.setAttribute('y2', toY);
    beam.classList.add('beam');
    svgContainer.appendChild(beam);
    
    // Create the glowing beam
    const beamGlow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    beamGlow.setAttribute('x1', fromX);
    beamGlow.setAttribute('y1', fromY);
    beamGlow.setAttribute('x2', toX);
    beamGlow.setAttribute('y2', toY);
    beamGlow.classList.add('beam-glow');
    svgContainer.appendChild(beamGlow);
  }
});

// Data flow animation
const inputFiles = [
  { y: 120, ext: 'ieee' },
  { y: 160, ext: 'arxiv' },
  { y: 200, ext: 'PMC' },
  { y: 240, ext: 'jstor' },
  { y: 280, ext: 'plos' }
];

const outputFiles = [
  { label: 'Trend Analysis', y: 100, logoSrc: '/assets/c1.png' }, 
  { label: 'Citation Network', y: 180, logoSrc: '/assets/c2.png' },  
  { label: 'Venue & Publisher', y: 260, logoSrc: '/assets/c3.png' },     
];

const svgContainer = document.querySelector('.paths-container');
const centerBox = document.querySelector('.center-box');

// Animation state
let isAnimating = false;

function createInputPath(startY) {
    const startX = 100;
    const endX = 400;
    const endY = 200;
    const controlX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
}

function createOutputPath(endY) {
    const startX = 400;
    const startY = 200;
    const endX = 680;
    const controlX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
}

function createInputPaper(data) {
    const container = document.createElement('div');
    container.className = 'paper-container';
    
    const paperIcon = document.createElement('div');
    paperIcon.className = 'paper-icon';
    paperIcon.textContent = data.ext;
    
    const label = document.createElement('span');
    label.textContent = data.label || data.ext;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'path');
    path.setAttribute('d', createInputPath(data.y));
    svgContainer.appendChild(path);
    
    container.appendChild(paperIcon);
    container.appendChild(label);
    document.querySelector('.container').appendChild(container);
    
    container.style.left = '70px';
    container.style.top = `${data.y}px`;

    return { container, paperIcon, path, ext: data.ext };
}

function createOutputBox(data) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'path');
    path.setAttribute('d', createOutputPath(data.y));
    svgContainer.appendChild(path);
    
    // Create output box
    const outputBox = document.createElement('div');
    outputBox.className = 'output-box';
    document.querySelector('.container').appendChild(outputBox);
    outputBox.style.top = `${data.y}px`;
    
    // Create logo image element
    const logo = document.createElement('img');
    logo.className = 'output-logo';
    logo.src = data.logoSrc;
    logo.alt = data.label + ' logo';
    outputBox.appendChild(logo);
    
    // Add title below the box
    const title = document.createElement('div');
    title.className = 'box-title';
    title.textContent = data.label;
    outputBox.appendChild(title);

    return { path, outputBox };
}

function animatePaperAlongPath(path, ext, onComplete) {
    const movingPaper = document.createElement('div');
    movingPaper.className = 'moving-paper';
    movingPaper.textContent = ext;
    document.querySelector('.container').appendChild(movingPaper);

    const length = path.getTotalLength();
    let start = null;
    const duration = 1200;

    path.style.strokeOpacity = "1";  // Make line visible when animation starts
    path.style.strokeDasharray = `${length}, ${length}`;
    path.style.strokeDashoffset = length;

    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = (timestamp - start) / duration;

        if (progress <= 1) {
            const point = path.getPointAtLength(length * progress);
            movingPaper.style.left = `${point.x}px`;
            movingPaper.style.top = `${point.y}px`;
            
            // Reveal only the traveled portion of the path
            path.style.strokeDashoffset = length * (1 - progress);

            requestAnimationFrame(animate);
        } else {
            movingPaper.remove();
            path.style.strokeOpacity = "0";  // Hide line when animation completes
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(animate);
}


function animateDotAlongPath(path, outputBox, onComplete) {
    const movingDot = document.createElement('div');
    movingDot.className = 'moving-dot';
    document.querySelector('.container').appendChild(movingDot);

    const length = path.getTotalLength();
    let start = null;
    const duration = 1000;

    path.style.strokeOpacity = "1";  // Make line visible when animation starts
    path.style.strokeDasharray = `${length}, ${length}`;
    path.style.strokeDashoffset = length;

    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = (timestamp - start) / duration;

        if (progress <= 1) {
            const point = path.getPointAtLength(length * progress);
            movingDot.style.left = `${point.x}px`;
            movingDot.style.top = `${point.y}px`;

            // Reveal only the traveled portion of the path
            path.style.strokeDashoffset = length * (1 - progress);

            requestAnimationFrame(animate);
        } else {
            movingDot.remove();
            path.style.strokeOpacity = "0";  // Hide line when animation completes

            outputBox.style.display = 'flex';  // Show output box
            outputBox.classList.add('highlight');
            setTimeout(() => outputBox.classList.remove('highlight'), 500);

            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(animate);
}

const inputs = inputFiles.map(createInputPaper);
const outputs = outputFiles.map(createOutputBox);

function pulseBox() {
    centerBox.classList.add('pulse');
    setTimeout(() => centerBox.classList.remove('pulse'), 300);
}

async function animateInputs() {
    // Hide output boxes when input animation starts
    outputs.forEach(output => {
        output.outputBox.style.opacity = '0';
    });

    // Animate all inputs (papers) to the center sequentially
    for (let i = 0; i < inputs.length; i++) {
        await new Promise(resolve => {
            animatePaperAlongPath(inputs[i].path, inputs[i].ext, () => {
                pulseBox();
                resolve();
            });
        });
        // Small delay between input animations
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    pulseBox(); // Final pulse after all inputs are processed
    return true;
}

async function animateOutputs() {
    // Animate all outputs sequentially
    for (let i = 0; i < outputs.length; i++) {
        await new Promise(resolve => {
            animateDotAlongPath(outputs[i].path, outputs[i].outputBox, () => {
                outputs[i].outputBox.style.opacity = '1'; // Show output box when dot reaches destination
                resolve();
            });
        });
    
        // Wait a bit before starting the next output animation
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Keep outputs visible for a moment
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Before next cycle, fade out output boxes
    outputs.forEach(output => {
        output.outputBox.style.opacity = '0';
    });

    // Small pause before starting next cycle
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
}

async function completeAnimationCycle() {
    if (isAnimating) return;
    isAnimating = true;

    try {
        await animateInputs();
        await new Promise(resolve => setTimeout(resolve, 800));
        await animateOutputs();
        isAnimating = false;
        setTimeout(completeAnimationCycle, 500);
    } catch (error) {
        console.error("Animation error:", error);
        isAnimating = false;
    }
}

setTimeout(completeAnimationCycle, 1000);

function showPaperAlert(message, title = "Alert", icon = "fa-exclamation-circle", duration = 7000) {
  const paperAlert = document.getElementById('paperAlert');
  const alertMessage = document.getElementById('alertMessage');
  const alertTitle = document.getElementById('alertTitle');
  const alertIcon = document.getElementById('alertIcon');
  
  // Set custom message, title and icon
  alertMessage.textContent = message;
  alertTitle.textContent = title;
  
  // Update the icon class
  alertIcon.className = ''; // Clear existing classes
  alertIcon.classList.add('fas', icon);
  
  // Show the alert
  paperAlert.classList.remove("hide");
  paperAlert.classList.add("show", "showAlert");
  
  // Auto-hide after specified duration
  setTimeout(() => {
    hideAlert();
  }, duration);
}

// Function to hide the alert with animation
function hideAlert() {
  const paperAlert = document.getElementById('paperAlert');
  paperAlert.classList.remove("show");
  paperAlert.classList.add("hide");
  setTimeout(() => {
    paperAlert.classList.remove("showAlert");
  }, 500);
}

// Set up close button functionality
document.querySelector('#paperAlert .close-btn').addEventListener('click', function() {
  hideAlert();
});

const featureCards = document.querySelectorAll('.feature-selection .glass');
  const selectionMessage = document.getElementById('selectionMessage');
  const selectedFeatureText = document.getElementById('selectedFeature');
  const selectedFeature = {"feature":null}

  let isLoggedIn = localStorage.getItem("username"); // Replace with your actual login check
  let selectedCard = null;

  featureCards.forEach(card => {
    card.addEventListener('click', () => {
      if (!isLoggedIn) {
       
        showPaperAlert(
          "You must be Logged In to continue!", 
          "Authentication Required",
          "fa-exclamation-circle", 
          7000
        );
        return;
      }
      const isAlreadySelected = card === selectedCard;

      if (isAlreadySelected) {
        card.classList.remove('selected');
        selectedCard = null;
        selectionMessage.classList.remove('visible');
      } else {
        if (selectedCard) {
          selectedCard.classList.remove('selected');
        }

        card.classList.add('selected');
        selectedCard = card;

        selectedFeature.feature = card.getAttribute('data-feature');
  
        selectedFeatureText.textContent = card.getAttribute('data-text');
        selectionMessage.classList.add('visible');
      }
    });
  });



const searchBtn = document.getElementById("searchbtn");
searchBtn.addEventListener("click", function () { 
  console.log("Search button clicked");
 


  const isLoggedIn = localStorage.getItem("username");
  if (!isLoggedIn) {
    alert("You must be signed in to perform a search.");
    return;
  }

  const searchInput = document.querySelector('#searchy');
  console.log("searchInput" , searchInput)
  if (!searchInput) {
    console.error("Search input element not found");
    alert("Search input not found. Please check the page structure.");
    return;
  }

  const searchTopic = searchInput.value.trim();
  const yearFilter = document.getElementById('year-filter');
  const searchYear = yearFilter ? yearFilter.value : "";
  const userId = localStorage.getItem("userId");

  saveSearchToFirebase(searchTopic, searchYear, selectedFeature )
  // alert(" saved the activity")

  // Validate inputs
  if (!searchTopic) {
    alert("Please enter a search topic");
    return;
  }

  console.log(`Searching for: ${searchTopic}, Year: ${searchYear}, Feature: ${selectedFeature}`);
  

  let currentPage = 0;
const nextBtn = document.getElementById("nextBtn");

nextBtn.addEventListener("click", function () {
  currentPage+=1
  alert("just checking bro " +currentPage );
  trendanalysis(currentPage);
});



function trendanalysis(pageNo){
       const originalText = searchBtn.textContent;
       searchBtn.textContent = "Processing...";
       searchBtn.disabled = true;
       nextBtn.style.display = "inline-block";
      

    fetch('/check-data-exists/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        topic: searchTopic,
        year: searchYear
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.exists) {
        console.log('Data exists, skipping analysis step');
        showPaperAlert(
          "Data exists", 
          "Trend Analysis.......",
          "fa-exclamation-circle", 
          7000
        );
        return fetch('/analyze-trends/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            topic: searchTopic,
            year: searchYear,
            page: pageNo
          })
        });
      } else {
        console.log('Data does not exist, starting full analysis');
        showPaperAlert(
          "Starting full analysis", 
          "ATrend Analysis.......",
          "fa-exclamation-circle", 
          7000
        );
        return fetch('/analyze/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            topic: searchTopic,
            year: searchYear
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Analysis failed: ${response.status}`);
          }
          return response.json();
        })
        .then(analysisData => {
          console.log('Analysis complete:', analysisData);
          // Now proceed to analyze-trends
          showPaperAlert(
            "Analysis complete", 
            "Trend Analysis.......",
            "fa-exclamation-circle", 
            7000
          );
          return fetch('/analyze-trends/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userId,
              topic: searchTopic,
              year: searchYear,
              page: pageNo
            })
          });
        });
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Trend analysis failed: ${response.status}`);
      }
      return response.json();
    })
    .then(trendData => {
      console.log('Trend analysis complete:', trendData);
      showPaperAlert(
        "Analysis complete", 
        "Trend Analysis.......",
        "fa-exclamation-circle", 
        7000
      );
      loadingOverlay.hide()
      // Handle redirection to results page or display results
    })
    .catch(error => {
      console.error('Error:', error);
      alert("There was an error processing your request. Please try again: " + error.message);
      showPaperAlert(
       `There was an error processing your request. Please try again:`  + error.message, 
        "Trend Analysis.......",
        "fa-exclamation-circle", 
        7000
      );
      loadingOverlay.hide()
    })
    .finally(() => {
      // Always reset button state
      searchBtn.textContent = originalText;
      searchBtn.disabled = false;
    });
  }



 if (selectedFeature.feature === 'trends') {
  console.log("here here")
  loadingOverlay.show("Loading Trend Analysis")
       trendanalysis(0);
  } 
   else if (selectedFeature.feature === 'citations') {
    loadingOverlay.show("Loading Citation Network Analysis")
    nextBtn.style.display = "none";
    currentPage = 0;
    showPaperAlert(
      "Analysis Started", 
      "Citation Network Analysis.......",
      "fa-exclamation-circle", 
      7000
    );

    const originalText = this.textContent;
    this.textContent = "Processing...";
    this.disabled = true;

    // First check if data exists in MongoDB
    fetch('/check-data-exists-citation/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userId: userId,
            topic: searchTopic,
            year: searchYear
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.exists) {
            console.log('Data exists, fetching citation data...');
            loadingOverlay.hide()
            window.open(`/citation-data?userId=${encodeURIComponent(userId)}&topic=${encodeURIComponent(searchTopic)}&year=${encodeURIComponent(searchYear)}`, '_blank');
        } else {
            console.log('Data does not exist, starting full analysis...');
            showPaperAlert(
              "Data Collecting....", 
              "Citation Network Analysis.......",
              "fa-exclamation-circle", 
              7000
            );
            return fetch('/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: userId,
                    topic: searchTopic,
                    year: searchYear
                })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Save failed: ${response.status}`);
                }
                return response.json();
            })
            .then(saveData => {
                console.log('Data saved successfully:', saveData);
                loadingOverlay.hide()
                window.open(`/citation-data?userId=${encodeURIComponent(userId)}&topic=${encodeURIComponent(searchTopic)}&year=${encodeURIComponent(searchYear)}`, '_blank');
            });
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showPaperAlert(
          "There was an error processing your request. Please try again: " + error.message, 
          "Citation Network Analysis.......",
          "fa-exclamation-circle", 
          7000
        );
        loadingOverlay.hide()
    })
    .finally(() => {
        // Always reset button state
        this.textContent = originalText;
        this.disabled = false;
    });
}
  
else if (selectedFeature.feature === 'venues') {
  nextBtn.style.display = "none";
  currentPage = 0;
  const originalText = this.textContent;
  this.textContent = "Processing...";
  this.disabled = true;
  console.log(" here here venue")
  showPaperAlert(
    "Analysis Started", 
    "Venue/Publisher Analysis.......",
    "fa-exclamation-circle", 
    7000
  );
  loadingOverlay.show("Started Loading.....")
  fetch('/check-data-exists-venue/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: userId,
      topic: searchTopic,
      year: searchYear
    })
  })
  .then(response => {
    if (!response.ok) {
    
      throw new Error(`Network response was not ok: ${response.status}`);
      
    }
   
    return response.json();
  })
  .then(data => {
    if (data.exists) {
      console.log('Data exists, loading dashboard directly');
      // If data exists, go directly to load_and_display_dashboard
      
      return fetch('/load_and_display_dashboard/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          topic: searchTopic,
          year: searchYear
        })
      });
    } else {
      console.log('Data does not exist, starting search process');
      showPaperAlert(
        "Data Collectiong....", 
        "Venue/Publisher Analysis.......",
        "fa-exclamation-circle", 
        7000
      );
      return fetch('/search/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          topic: searchTopic,
          year: searchYear
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        return response.json();
      })
      .then(searchData => {
        console.log('Search complete:', searchData);
       
        return fetch('/load_and_display_dashboard/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            topic: searchTopic,
            year: searchYear
          })
        });
      });
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Dashboard loading failed: ${response.status}`);
    }
    return response.json();
  })
  .then(dashboardData => {
   
    console.log('Dashboard loaded successfully:', dashboardData);
    loadingOverlay.hide();
    // 
  })
  .catch(error => {
    console.error('Error:', error);
    showPaperAlert(
      "There was an error processing your request. Please try again: " + error.message, 
      "Venue/Publisher Analysis.......",
      "fa-exclamation-circle", 
      7000
    );
  })
  .finally(() => {
    this.textContent = originalText;
    this.disabled = false;
  });

} else {
    alert("Invalid feature selected. Please choose a valid feature.");
  }
});


const loadingOverlay = {
  overlay: document.getElementById('loading-overlay'),
  cyclone: null,
  loadingText: null,
  animationInterval: null,
  paperInterval: null,
  
  initialize() {
    this.cyclone = document.getElementById('cyclone');
    this.loadingText = document.getElementById('loading-text');
    this.setupAnimation();
    
    // Make the background whiter by changing the overlay background
    this.overlay.style.backgroundColor = 'rgba(137, 138, 183, 0.9)'; // More white, slightly transparent
  },
  
  setupAnimation() {
    // Pre-setup animation elements so they're ready when needed
    for (let i = 0; i < 10; i++) {
      this.createPaper(i);
    }
  },
  
  show(message = 'Processing...') {
    this.loadingText.textContent = message;
    this.overlay.classList.add('active');
    
    // Start creating papers
    this.paperInterval = setInterval(() => {
      this.createPaper();
    }, 120);
    
    // Animate loading text
    let dots = 0;
    this.animationInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      this.loadingText.textContent = message + '.'.repeat(dots);
    }, 500);
  },
  
  hide() {
    this.overlay.classList.remove('active');
    
    // Clear intervals
    clearInterval(this.paperInterval);
    clearInterval(this.animationInterval);
    
    // Clear all papers after animation ends
    setTimeout(() => {
      while (this.cyclone.firstChild) {
        this.cyclone.removeChild(this.cyclone.firstChild);
      }
    }, 300);
  },
  
  createPaper(index) {
    const paper = document.createElement('div');
    paper.className = 'paper';
    
    // Randomize paper appearance for more realistic effect
    const size = 8 + Math.random() * 12;
    paper.style.width = `${size}px`;
    paper.style.height = `${size * 1.3}px`;
    
    // Change paper color to grayish (varying shades of gray)
    const grayness = 65 + Math.random() * 20; // Range from 65-85% gray (darker)
    paper.style.backgroundColor = `hsl(0, 0%, ${grayness}%)`;
    
    // Give it a slight skew to look more like paper
    const skewX = Math.random() * 10 - 5;
    const skewY = Math.random() * 10 - 5;
    paper.style.transform = `skew(${skewX}deg, ${skewY}deg)`;
    
    // Start position - at the top of the cyclone
    const startAngle = Math.random() * Math.PI * 2;
    const startRadius = 60 + Math.random() * 20;
    const startX = 100 + startRadius * Math.cos(startAngle);
    const startY = -20; // Start above the visible area
    
    paper.style.left = `${startX}px`;
    paper.style.top = `${startY}px`;
    
    this.cyclone.appendChild(paper);
    
    // Animate the paper with a specific starting point in the spiral
    this.animatePaperInCyclone(paper, startAngle);
  },
  
  animatePaperInCyclone(paper, initialAngle) {
    // Animation duration
    const duration = 6000 + Math.random() * 2000;
    const startTime = Date.now();
    
    // Initial state
    let angle = initialAngle || 0;
    let height = -20; // Start above the visible area
    const maxHeight = 350; // End height
    const rotationSpeed = 1.0 + Math.random() * 0.5; // More consistent rotation speed
    
    const animateFrame = () => {
      if (!this.overlay.classList.contains('active')) {
        if (paper.parentNode === this.cyclone) {
          this.cyclone.removeChild(paper);
        }
        return;
      }
      
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = elapsed / duration;
      
      if (progress < 1) {
        // Calculate new height with a clear downward flow
        // Move from top to bottom with easing
        height = -20 + (maxHeight + 20) * Math.min(1, progress * 1.2);
        
        // Calculate spiral radius - wider at top, narrower at bottom
        // Creates a funnel/cyclone shape
        const heightProgress = height / maxHeight;
        const currentRadius = Math.max(10, 80 - 60 * heightProgress);
        
        // Rotate faster as it gets closer to the bottom
        const adjustedRotation = rotationSpeed * (1 + heightProgress * 0.5);
        angle += adjustedRotation * 0.03;
        
        // Calculate position
        const x = 100 + currentRadius * Math.cos(angle);
        const y = height;
        
        // Apply position
        paper.style.left = `${x}px`;
        paper.style.top = `${y}px`;
        
        // Apply rotation and scaling
        const rotation = angle * (180 / Math.PI);
        // Increase fluttering effect as paper falls
        const flutter = Math.sin(elapsed * 0.01) * (5 + heightProgress * 10);
        paper.style.transform = `rotate(${rotation + flutter}deg) scale(${0.8 + Math.sin(progress * Math.PI * 4) * 0.1})`;
        
        // Adjust opacity near the end for a fading effect
        if (progress > 0.8) {
          paper.style.opacity = (1 - progress) * 5;
        }
        
        requestAnimationFrame(animateFrame);
      } else {
        // Remove paper when animation completes
        if (paper.parentNode === this.cyclone) {
          this.cyclone.removeChild(paper);
        }
      }
    };
    
    requestAnimationFrame(animateFrame);
  }
};
// Initialize the loading overlay when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  loadingOverlay.initialize();
});
const words = document.querySelectorAll('.liquid-word');
            const splashContainer = document.getElementById('splashContainer');
            let currentIndex = 0;
            
            // Prepare each word with character spans and paper drops
            words.forEach(word => {
                const letters = word.textContent.split('');
                word.innerHTML = '';
                
                letters.forEach(letter => {
                    const charSpan = document.createElement('span');
                    charSpan.className = 'liquid-char';
                    charSpan.textContent = letter;
                    word.appendChild(charSpan);
                    
                    // Add paper drop to each character
                    const paperDrop = document.createElement('div');
                    paperDrop.className = 'paper-drop';
                    charSpan.appendChild(paperDrop);
                    
                    // Add paper background to each character
                    for (let i = 0; i < 3; i++) {
                        const paperBg = document.createElement('div');
                        paperBg.className = 'paper-piece';
                        paperBg.style.width = `${Math.random() * 20 + 20}px`;
                        paperBg.style.height = `${Math.random() * 15 + 15}px`;
                        paperBg.style.transform = `rotate(${Math.random() * 40 - 20}deg)`;
                        
                        // Random position around the character
                        const offsetX = (Math.random() - 0.5) * 30;
                        const offsetY = (Math.random() - 0.5) * 30;
                        paperBg.style.left = `calc(50% + ${offsetX}px)`;
                        paperBg.style.top = `calc(50% + ${offsetY}px)`;
                        
                        // Random colors (paper-like)
                        const colors = ['#ffffff', '#f8f8f8', '#f0f0f0', '#fffafa', '#f5f5f5'];
                        paperBg.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                        
                        charSpan.appendChild(paperBg);
                    }
                });
            });
            
            // Function to create paper splashes
            function createPaperSplashes(centerX, centerY) {
                for (let i = 0; i < 15; i++) {
                    setTimeout(() => {
                        const paper = document.createElement('div');
                        paper.className = 'paper-piece';
                        
                        // Random size and shape
                        const size = Math.random() * 20 + 10;
                        paper.style.width = `${size}px`;
                        paper.style.height = `${size * (Math.random() * 0.5 + 0.5)}px`;
                        
                        // Random rotation
                        const rotation = Math.random() * 360;
                        paper.style.setProperty('--rotation', `${rotation}deg`);
                        
                        // Random position around center
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * 100 + 20;
                        const x = centerX + Math.cos(angle) * distance;
                        const y = centerY + Math.sin(angle) * distance;
                        
                        paper.style.left = `${x}px`;
                        paper.style.top = `${y}px`;
                        
                        // Random paper colors
                        const colors = ['#ffffff', '#f8f8f8', '#f0f0f0', '#fffafa', '#f5f5f5'];
                        paper.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                        
                        // Add a slight border on some pieces
                        if (Math.random() > 0.7) {
                            paper.style.border = '1px solid rgba(0,0,0,0.05)';
                        }
                        
                        // Animation
                        paper.style.animation = `paperSplash ${Math.random() * 0.8 + 0.6}s forwards`;
                        
                        splashContainer.appendChild(paper);
                        
                        // Remove after animation
                        setTimeout(() => paper.remove(), 1500);
                    }, i * 40);
                }
            }
            
            // Function to animate letters in
            function animateLettersIn(word) {
                const chars = word.querySelectorAll('.liquid-char');
                
                chars.forEach((char, i) => {
                    setTimeout(() => {
                        // Animate the character
                        char.style.animation = 'paperIn 0.7s forwards';
                        char.style.opacity = '1';
                        
                        // Animate paper drop
                        const paperDrop = char.querySelector('.paper-drop');
                        setTimeout(() => {
                            paperDrop.style.animation = 'paperDrop 0.5s forwards';
                        }, 350);
                        
                        // Animate paper pieces
                        const paperPieces = char.querySelectorAll('.paper-piece');
                        paperPieces.forEach((piece, j) => {
                            setTimeout(() => {
                                piece.style.opacity = '1';
                                piece.style.transform += ' scale(1)';
                            }, j * 100 + 300);
                        });
                        
                    }, i * 100);
                });
            }
            
            // Function to animate letters out
            function animateLettersOut(word) {
                const chars = word.querySelectorAll('.liquid-char');
                
                chars.forEach((char, i) => {
                    setTimeout(() => {
                        char.style.animation = 'paperOut 0.5s forwards';
                        
                        // Hide paper pieces
                        const paperPieces = char.querySelectorAll('.paper-piece');
                        paperPieces.forEach(piece => {
                            piece.style.opacity = '0';
                        });
                    }, i * 60);
                });
            }
            
            // Function for word transition
            function transitionWords() {
                // Get current word and calculate center position
                const currentWord = words[currentIndex];
                const rect = currentWord.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                // Animate current word out
                animateLettersOut(currentWord);
                
                setTimeout(() => {
                    // Hide current word
                    currentWord.classList.remove('active');
                    
                    // Go to next word
                    currentIndex = (currentIndex + 1) % words.length;
                    const nextWord = words[currentIndex];
                    
                    // Show next word
                    nextWord.classList.add('active');
                    
                    // Create paper splash effect
                    createPaperSplashes(centerX, centerY);
                    
                    // Animate next word in
                    setTimeout(() => {
                        animateLettersIn(nextWord);
                    }, 200);
                    
                }, 500);
            }
            
            // Initial animation
            setTimeout(() => {
                animateLettersIn(words[0]);
            }, 500);
            
            // Start word transition cycle
            setInterval(transitionWords, 3500);


const carousel = document.getElementById('carousel');
const pages = document.querySelectorAll('.page');
const nextBtn2 = document.getElementById('nextBtn2');
const prevBtn = document.getElementById('prevBtn');
const dots = document.querySelectorAll('.dot');
const pageShadows = document.querySelectorAll('.page-shadow');
        
let currentPage = 0;
let totalSlides = 6; // Confirm we have 6 total slides
        
// Initialize pages
pages.forEach((page, index) => {
  page.style.transform = 'rotateY(0deg)';
  page.style.zIndex = 6 - index;
    });
    
    // Function to turn to next page and rotate carousel
    function nextPage() {
      if (currentPage < pages.length) {
        // Apply shadow during turn
        if (currentPage > 0) {
          pageShadows[currentPage-1].style.opacity = '0';
        }
      
        pages[currentPage].style.transform = 'rotateY(-180deg)';
        pages[currentPage].style.zIndex = 10 + currentPage;
                    
        if (currentPage < pages.length - 1) {
          pageShadows[currentPage].style.opacity = '1'; 
        }
                    
        currentPage++;
                    
        // Rotate carousel - Fixed rotation calculation for 6 slides (360 degrees)
        const newRotationDegree = (currentPage % totalSlides) * (360 / totalSlides);
        carousel.style.transform = `rotateY(${-newRotationDegree}deg)`;
                    
        // Update pagination dots
        updatePagination(currentPage % totalSlides);
      }
    }
            
    // Function to turn to previous page and rotate carousel
    function prevPage() {
      if (currentPage > 0) {
        currentPage--;
                    
        // Apply shadow during turn
        if (currentPage > 0) {
          pageShadows[currentPage-1].style.opacity = '1';
        }
                    
        pages[currentPage].style.transform = 'rotateY(0deg)';
        setTimeout(() => {
          pages[currentPage].style.zIndex = 10 - currentPage;
        }, 300);
                    
        pageShadows[currentPage].style.opacity = '0';
                    
        // Rotate carousel - Fixed rotation calculation
        const newRotationDegree = (currentPage % totalSlides) * (360 / totalSlides);
        carousel.style.transform = `rotateY(${-newRotationDegree}deg)`;
                    
        // Update pagination dots
        updatePagination(currentPage % totalSlides);
      }
    }
            
    // Function to reset book to beginning
    function resetBook() {
      pages.forEach((page, index) => {
        page.style.transition = 'none';
        page.style.transform = 'rotateY(0deg)';
        setTimeout(() => {
          page.style.zIndex = 5 - index;
          page.style.transition = 'transform 0.6s ease, z-index 0s 0.3s';
        }, 50);
      });
                
      pageShadows.forEach(shadow => {
        shadow.style.opacity = '0';
      });
                
      currentPage = 0;
                
      // Reset carousel and pagination
      carousel.style.transform = 'rotateY(0deg)';
      updatePagination(0);
    }
            
    // Function to update pagination dots
    function updatePagination(index) {
      dots.forEach((dot, i) => {
        if (i === index) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
            
    // Event listeners
    nextBtn2.addEventListener('click', nextPage);
    prevBtn.addEventListener('click', prevPage);
            
    // Make pagination dots clickable
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        // Find the current actual position in the book
        const currentInCycle = currentPage % totalSlides;
                    
        // Calculate how many pages to move
        let pagesToMove;
                    
        if (index > currentInCycle) {
          pagesToMove = index - currentInCycle;
        } else if (index < currentInCycle) {
          pagesToMove = totalSlides - currentInCycle + index;
        } else {
          return; // Already on this page
        }
                    
        // Move the pages
        for (let i = 0; i < pagesToMove; i++) {
          setTimeout(() => nextPage(), i * 400);
        }
      });
    });
          
    // Allow clicking on pages to turn them
    pages.forEach((page, index) => {
      page.addEventListener('click', () => {
        if (index === currentPage - 1) {
          prevPage();
        } else if (index === currentPage) {
          nextPage();
        }
      });
    });    
    
    const canvas = document.getElementById('bgParticles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        const colors = ['#ff6ec4', '#7873f5', '#1fd1f9', '#43e97b'];
        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    
        function randomBetween(a, b) { return a + Math.random() * (b - a); }
    
        function createParticles(num) {
            particles = [];
            for (let i = 0; i < num; i++) {
                particles.push({
                    x: randomBetween(0, width),
                    y: randomBetween(0, height),
                    r: randomBetween(2, 5),
                    color: colors[Math.floor(Math.random() * colors.length)],
                    dx: randomBetween(-0.7, 0.7),
                    dy: randomBetween(-0.7, 0.7),
                    alpha: randomBetween(0.3, 0.8)
                });
            }
        }
    
        function drawParticles() {
            ctx.clearRect(0, 0, width, height);
            for (let p of particles) {
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 16;
                ctx.fill();
                ctx.restore();
    
                p.x += p.dx;
                p.y += p.dy;
                if (p.x < 0 || p.x > width) p.dx *= -1;
                if (p.y < 0 || p.y > height) p.dy *= -1;
            }
            requestAnimationFrame(drawParticles);
        }
    
        createParticles(48);
        drawParticles();
    
        window.addEventListener('resize', () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            createParticles(48);
        });
    }
