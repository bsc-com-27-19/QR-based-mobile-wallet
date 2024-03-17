document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    // Handle form submission
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        // Get form data
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const formData = { username, password }; // Create an object with username and password
        // Send form data to server
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Handle successful login (e.g., save token to localStorage)
            console.log(data); // Log response from server
            alert('Login Successful!'); // Display success message
            // Redirect to protected page or perform other actions
            // Redirect to registration page
            window.location.href = '';
        })
        .catch(error => {
            console.error('There was a problem with your fetch operation:', error);
            alert('Login Failed!'); // Display error message
        });
    });
});
