$(document).ready(function () {
    $("#submit").click(function () {
        const email = $('#email').val();
        const password = $('#password').val();

        $.ajax({
            type: "POST",
            url: '/api/v1/user/login',
            data: { email, password },
            xhrFields: {
                withCredentials: true   // 🔥 THIS IS THE FIX
            },
            success: function (response) {
                alert("login successfully");
                window.location.href = "/dashboard";
            },
            error: function (error) {
                alert(`Login error: ${error.responseText}`);
            }
        });
    });
});
