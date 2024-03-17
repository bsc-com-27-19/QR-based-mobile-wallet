document.addEventListener('DOMContentLoaded', function() {
    const signUpForm = document.getElementById('signUpForm');
    // Handle form submission
    signUpForm.addEventListener('submit', function(event) {
        event.preventDefault();
        // Serialize form data to JSON
        const formData = {
            username: signUpForm.elements['username'].value,
            password: signUpForm.elements['password'].value,
        };

        // Send form data to server as JSON
        fetch('/register', {
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
            return response.text();
        })
        .then(data => {
            console.log(data); // Log response from server
            alert('Account Created Successfully!'); // Display success message
             // Redirect to registration page
             window.location.href = 'login.html';
        })
        .catch(error => {
            console.error('There was a problem with your fetch operation:', error);
            alert('Account Creation Failed!'); // Display error message
        });
    });
});
