document.addEventListener("DOMContentLoaded", async () => {
  // Firebase Auth & Firestore setup - reference from existing code
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  // Activity tab elements
  const activityTab = document.getElementById("activity-tab");
  const searchCountElement = activityTab.querySelector(".stat-value");
  const timelineContainer = activityTab.querySelector(".timeline");
  
  // Function to format relative time (e.g., "2 days ago")
  function getRelativeTimeString(timestamp) {
    const now = new Date();
    const searchTime = timestamp.toDate();
    const diffInMs = now - searchTime;
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      if (diffInHours === 0) {
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`;
      }
      return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
    } else if (diffInDays === 1) {
      return "Yesterday";
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const diffInWeeks = Math.floor(diffInDays / 7);
      return diffInWeeks === 1 ? "1 week ago" : `${diffInWeeks} weeks ago`;
    } else {
      return searchTime.toLocaleDateString();
    }
  }
  
  // Function to create a timeline item
  function createTimelineItem(activity) {
    const timelineItem = document.createElement("div");
    timelineItem.className = "timeline-item";
    
    const timelineDot = document.createElement("div");
    timelineDot.className = "timeline-dot";
    
    const timelineContent = document.createElement("div");
    timelineContent.className = "timeline-content";
    
    const title = document.createElement("h4");
    title.textContent = activity.type === "search" ? activity.query : activity.title;
    
    const description = document.createElement("p");
    if (activity.type === "search") {
      description.textContent = `You searched for "${activity.query}"`;
    } else if (activity.type === "save") {
      description.textContent = `You saved "${activity.title}"`;
    } else if (activity.type === "profile") {
      description.textContent = "You updated your profile information";
    }
    
    const timelineDate = document.createElement("span");
    timelineDate.className = "timeline-date";
    
    const clockIcon = document.createElement("i");
    clockIcon.className = "fas fa-clock";
    
    timelineDate.appendChild(clockIcon);
    timelineDate.append(` ${getRelativeTimeString(activity.timestamp)}`);
    
    timelineContent.appendChild(title);
    timelineContent.appendChild(description);
    timelineContent.appendChild(timelineDate);
    
    timelineItem.appendChild(timelineDot);
    timelineItem.appendChild(timelineContent);
    
    return timelineItem;
  }

  // Function to load and display user activity
  async function loadUserActivity() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      // Get user activity from Firestore
      const activitiesSnapshot = await db.collection("users")
        .doc(user.uid)
        .collection("activities")
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();
      
      // Clear existing timeline content
      timelineContainer.innerHTML = "";
      
      // Track search count
      let searchCount = 0;
      
      if (!activitiesSnapshot.empty) {
        activitiesSnapshot.forEach(doc => {
          const activity = doc.data();
          
          // Count searches for the stat display
          if (activity.type === "search") {
            searchCount++;
          }
          
          // Create and append timeline item
          const timelineItem = createTimelineItem(activity);
          timelineContainer.appendChild(timelineItem);
        });
        
        // Update search count display
        searchCountElement.textContent = searchCount;
      } else {
        // No activities found
        searchCountElement.textContent = "0";
        
        // Display a message when no activities are found
        const noActivitiesMessage = document.createElement("div");
        noActivitiesMessage.className = "empty-state";
        noActivitiesMessage.innerHTML = `
          <i class="fas fa-history"></i>
          <p>No activity history found. Your recent searches and actions will appear here.</p>
        `;
        timelineContainer.appendChild(noActivitiesMessage);
      }
    } catch (error) {
      console.error("Error loading user activity:", error);
      timelineContainer.innerHTML = `<div class="error-message">Failed to load activity history.</div>`;
    }
  }
  
  // Function to save search activity
  window.saveSearchActivity = async (query) => {
    const user = auth.currentUser;
    if (!user || !query) return;
    
    try {
      // Create activity object
      const activity = {
        type: "search",
        query: query,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Save to Firestore
      await db.collection("users")
        .doc(user.uid)
        .collection("activities")
        .add(activity);
        
      console.log("Search activity saved successfully");
    } catch (error) {
      console.error("Error saving search activity:", error);
    }
  };
  
  // Function to save profile update activity
  window.saveProfileUpdateActivity = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
      // Create activity object
      const activity = {
        type: "profile",
        title: "Profile Updated",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Save to Firestore
      await db.collection("users")
        .doc(user.uid)
        .collection("activities")
        .add(activity);
        
      console.log("Profile update activity saved successfully");
    } catch (error) {
      console.error("Error saving profile update activity:", error);
    }
  };
  
  // Function to save article activity
  window.saveArticleActivity = async (title, articleId) => {
    const user = auth.currentUser;
    if (!user || !title) return;
    
    try {
      // Create activity object
      const activity = {
        type: "save",
        title: title,
        articleId: articleId || null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Save to Firestore
      await db.collection("users")
        .doc(user.uid)
        .collection("activities")
        .add(activity);
        
      console.log("Article save activity recorded successfully");
    } catch (error) {
      console.error("Error saving article activity:", error);
    }
  };

  // Load activity when tab is clicked
  const activityTabBtn = document.querySelector('[data-tab="activity"]');
  if (activityTabBtn) {
    activityTabBtn.addEventListener("click", loadUserActivity);
  }
  
  // Update the save profile button to also record the activity
  const saveBtn = document.getElementById("saveBtn");
  const originalClickHandler = saveBtn.onclick;
  
  saveBtn.addEventListener("click", async () => {
    // Call the original handler first
    if (typeof originalClickHandler === "function") {
      originalClickHandler();
    }
    
    // Add activity tracking
    await saveProfileUpdateActivity();
  });

  // Hook this up to your search functionality
  // Example: If you have a search form
  const searchForm = document.getElementById("searchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      const searchInput = searchForm.querySelector("input[type=search]");
      if (searchInput && searchInput.value.trim()) {
        saveSearchActivity(searchInput.value.trim());
      }
    });
  }
  
  // Load activity data when the page loads if user is on activity tab
  auth.onAuthStateChanged(user => {
    if (user && activityTab.classList.contains("active")) {
      loadUserActivity();
    }
  });
});



