// Student ID: 23778313


// Student Name: Jamar Brown

function updateClock() {
    // Create a new Date object to get new current time
    const now = new Date();

    // Extract hours, minutes, and seconds

    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();


    // Add leading zeros if numbers are less than 10 for formatting
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    // Format the time string
    const timeString = `${hours}:${minutes}:${seconds}`;

    // Update the content of an HTML element with the ID "clock"
    // Ensure you have a <div id="clock"> in your html
    document.getElementById('clock').textContent = timeString;
}

// Call the updateClock function every 1000 milliseconds (1 second)
setInterval(updateClock, 1000);

// Call it once immediately to display the time on page load
updateClock();