document.addEventListener('DOMContentLoaded', () => {
    // Preload default doctors data if not present
    preloadDefaultDoctors();

    // Load doctor categories on doctors.html
    if (document.getElementById('doctor-categories')) {
        loadDoctorCategories();
    }

    // Load all doctors on appointment.html and setup display
    if (document.getElementById('doctor')) {
        const doctorSelect = document.getElementById('doctor');

        // Load all doctors on focus of doctor select
        doctorSelect.addEventListener('focus', () => {
            doctorSelect.innerHTML = '<option value="">-- Select Doctor --</option>';
            ajaxRequest('GET', '/doctors/categories', null, (status, response) => {
                if (status === 200) {
                    const categories = JSON.parse(response);
                    let allDoctors = [];
                    let processedCount = 0;
                    if (categories.length === 0) return;
                    categories.forEach(category => {
                        ajaxRequest('GET', `/doctors?category=${encodeURIComponent(category)}`, null, (status2, response2) => {
                            if (status2 === 200) {
                                const doctors = JSON.parse(response2);
                                allDoctors = allDoctors.concat(doctors);
                            }
                            processedCount++;
                            if (processedCount === categories.length) {
                                // Populate dropdown with all doctors
                                allDoctors.forEach(doc => {
                                    const option = document.createElement('option');
                                    option.value = doc.name;
                                    option.textContent = doc.name;
                                    doctorSelect.appendChild(option);
                                });
                            }
                        });
                    });
                } else {
                    // Fallback to localStorage doctors
                    const localDoctors = getLocalDoctors();
                    localDoctors.forEach(doc => {
                        const option = document.createElement('option');
                        option.value = doc.name;
                        option.textContent = doc.name;
                        doctorSelect.appendChild(option);
                    });
                }
            });
        });

        doctorSelect.addEventListener('change', () => {
            updateDoctorDisplay(doctorSelect.value);
        });
    }

    // Setup autocomplete for doctor-name input
    const doctorNameInput = document.getElementById('doctor-name');
    if (doctorNameInput) {
        setupDoctorNameAutocomplete(doctorNameInput);
    }

    // Handle add doctor form submission
    const addDoctorForm = document.getElementById('add-doctor-form');
    if (addDoctorForm) {
        addDoctorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addNewDoctor();
        });
    }

    // Handle appointment form submission
    const appointmentForm = document.getElementById('appointment-form');
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Format date from YYYY-MM-DD to DD/MM/YY (Pakistani style)
            // Removed date reformatting to keep YYYY-MM-DD for backend compatibility

            // Format time to 24-hour HH:mm (Pakistani style, no AM/PM)
            const timeInput = appointmentForm.querySelector('#time');
            if (timeInput && timeInput.value) {
                // Native input type="time" already gives HH:mm in 24-hour format
                const timeParts = timeInput.value.split(':');
                if (timeParts.length === 2) {
                    let hours = timeParts[0].padStart(2, '0');
                    let minutes = timeParts[1].padStart(2, '0');
                    timeInput.value = `${hours}:${minutes}`;
                }
            }

            bookAppointment();
        });
    }

    // Handle registration form submission
    const registrationForm = document.getElementById('registration-form');
    if (registrationForm) {
        registrationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            registerPatient();
        });
    }

    // Handle login form submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            loginPatient();
        });
    }

    // Handle symptom checker form submission
    const symptomForm = document.getElementById('symptom-form');
    if (symptomForm) {
        symptomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            checkSymptoms();
        });
    }

    // Smooth scroll for internal links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Intersection Observer for entrance animations
    const observerOptions = {
        threshold: 0.1
    };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.section-animate').forEach(section => {
        observer.observe(section);
    });

    // Sticky header with compact mode on scroll
    const header = document.querySelector('header');
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('compact');
        } else {
            header.classList.remove('compact');
        }
        lastScrollY = window.scrollY;
    });

    // Button click animation
    document.querySelectorAll('button, a.button, .btn-login, .btn-register, .btn-appointment').forEach(btn => {
        btn.classList.add('btn-click-animate');
    });
});

// Helper function to make AJAX requests
function ajaxRequest(method, url, data, callback) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            callback(xhr.status, xhr.responseText);
        }
    };
    xhr.send(data ? JSON.stringify(data) : null);
}

function loadDoctorCategoriesForAppointment(callback) {
    ajaxRequest('GET', '/doctors/categories', null, (status, response) => {
        const categorySelect = document.getElementById('doctor-category');
        if (status === 200) {
            const categories = JSON.parse(response);
            categorySelect.innerHTML = '<option value="">--Select Category--</option>';

            // Use only categories from predefined doctors in localStorage
            const localDoctors = getLocalDoctors();
            const localCategories = [...new Set(localDoctors.map(doc => doc.category))];

            // Filter categories to only those in localCategories
            const filteredCategories = categories.filter(cat => localCategories.includes(cat));

            filteredCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                categorySelect.appendChild(option);
            });
            if (callback) callback();
        } else {
            alert('Failed to load doctor categories');
        }
    });
}

// Load doctors for appointment page by category
function loadDoctorsForAppointment(category, callback) {
    const doctorSelect = document.getElementById('doctor');
    ajaxRequest('GET', `/doctors?category=${encodeURIComponent(category)}`, null, (status, response) => {
        if (status === 200) {
            const doctors = JSON.parse(response);
            doctorSelect.innerHTML = '<option value="">--Select Doctor--</option>';
            doctors.forEach(doc => {
                const option = document.createElement('option');
                option.value = doc.name;
                option.textContent = doc.name;
                doctorSelect.appendChild(option);
            });
            if (callback) callback();
        } else {
            // Fallback to localStorage doctors
            const localDoctors = getLocalDoctors().filter(doc => doc.category === category);
            doctorSelect.innerHTML = '<option value="">--Select Doctor--</option>';
            localDoctors.forEach(doc => {
                const option = document.createElement('option');
                option.value = doc.name;
                option.textContent = doc.name;
                doctorSelect.appendChild(option);
            });
            if (callback) callback();
        }
    });
}

// Update doctor display section in booking
function updateDoctorDisplay(doctorName) {
    const doctors = getLocalDoctors();
    const doctor = doctors.find(d => d.name === doctorName);
    if (!doctor) return;

    const displayName = document.getElementById('display-doctor-name');
    const displayCategory = document.getElementById('display-doctor-category');
    const displayExperience = document.getElementById('display-doctor-experience');
    const displayContact = document.getElementById('display-doctor-contact');
    const displayImage = document.getElementById('display-doctor-image');

    displayName.textContent = doctor.name;
    displayCategory.textContent = doctor.category;
    displayExperience.textContent = `Experience: ${doctor.experience} years`;
    displayContact.textContent = `Contact: ${doctor.phone || 'N/A'}`;
    // Image references removed due to missing images
    displayImage.src = 'images/default-doctor.png';
}

// Load doctor categories from backend
function loadDoctorCategories() {
    ajaxRequest('GET', '/doctors/categories', null, (status, response) => {
        if (status === 200) {
            const categories = JSON.parse(response);
            const container = document.getElementById('doctor-categories');
            const select = document.getElementById('doctor-category');
            container.innerHTML = '';
            select.innerHTML = '<option value="">--Select Category--</option>';

            // Get categories from localStorage doctors
            const localDoctors = getLocalDoctors();
            const localCategories = [...new Set(localDoctors.map(doc => doc.category))];

            // Merge backend and local categories
            const allCategories = Array.from(new Set([...categories, ...localCategories]));

            allCategories.forEach(cat => {
                // Add category button
                const btn = document.createElement('button');
                btn.textContent = cat;
                btn.addEventListener('click', () => loadDoctorsByCategory(cat));
                container.appendChild(btn);
                // Add category option to select
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                select.appendChild(option);
            });
        } else {
            alert('Failed to load doctor categories');
        }
    });
}

// Load doctors by category from backend
function loadDoctorsByCategory(category) {
    if (!category) return;
    ajaxRequest('GET', `/doctors?category=${encodeURIComponent(category)}`, null, (status, response) => {
        const list = document.getElementById('doctors-list');
        if (status === 200) {
            const doctors = JSON.parse(response);
            list.innerHTML = '';
            if (doctors.length === 0) {
                list.textContent = 'No doctors found in this category.';
                return;
            }
            doctors.forEach(doc => {
                const div = document.createElement('div');
                // Image references removed due to missing images
                const imgSrc = 'images/default-doctor.png';
                div.innerHTML = `<img src="${imgSrc}" alt="${doc.name}" class="doctor-image" />
                    <div>
                        <h3>${doc.name}</h3>
                        <p>Experience: ${doc.experience} years</p>
                        <p>Contact: ${doc.phone}</p>
                    </div>`;
                list.appendChild(div);
            });
        } else {
            // If backend fails, load from localStorage
            const localDoctors = getLocalDoctors().filter(doc => doc.category === category);
            list.innerHTML = '';
            if (localDoctors.length === 0) {
                list.textContent = 'No doctors found in this category.';
                return;
            }
            localDoctors.forEach(doc => {
                const div = document.createElement('div');
                const imgSrc = doc.image || 'images/default-doctor.png';
                div.innerHTML = `<img src="${imgSrc}" alt="${doc.name}" class="doctor-image" />
                    <div>
                        <h3>${doc.name}</h3>
                        <p>Experience: ${doc.experience} years</p>
                        <p>Contact: ${doc.phone}</p>
                    </div>`;
                list.appendChild(div);
            });
        }
    });
}

// Book appointment
function bookAppointment() {
    const form = document.getElementById('appointment-form');
    const messageDiv = document.getElementById('appointment-message');

    // Get patientId from logged in user
    const patientId = window.loggedInPatientId;
    if (!patientId) {
        messageDiv.textContent = 'Please login to book an appointment.';
        messageDiv.style.color = 'red';
        return;
    }

    // Get doctorCategory from local doctors list by matching doctor name
    const doctorName = form.doctor.value;
    const doctors = getLocalDoctors();
    const doctor = doctors.find(d => d.name === doctorName);
    if (!doctor) {
        messageDiv.textContent = 'Selected doctor not found.';
        messageDiv.style.color = 'red';
        return;
    }
    const doctorCategory = doctor.category;

    // Prepare data to send
    const data = {
        doctorCategory: doctorCategory,
        doctor: doctorName,
        patientId: patientId,
        date: form.date.value,
        time: form.time.value,
        disease: form.reason.value || ''
    };

    ajaxRequest('POST', '/appointments', data, (status, response) => {
        if (status === 200) {
            messageDiv.textContent = 'Appointment booked successfully.';
            messageDiv.style.color = 'green';
            form.reset();
        } else {
            messageDiv.textContent = 'Failed to book appointment: ' + response;
            messageDiv.style.color = 'red';
        }
    });
}

// Get doctors from localStorage
function getLocalDoctors() {
    const doctorsJSON = localStorage.getItem('localDoctors');
    return doctorsJSON ? JSON.parse(doctorsJSON) : [];
}

// Preload default doctors data into localStorage if not already present
function preloadDefaultDoctors() {
    const existingDoctors = getLocalDoctors();
    if (existingDoctors.length > 0) return; // Already loaded

    const defaultDoctors = [
        // Child Specialist
        { name: "Dr Munawar Siyal", category: "Child Specialist", experience: 10, phone: "" },
        { name: "Dr Ali Akbar Siyal", category: "Child Specialist", experience: 8, phone: "" },
        { name: "Dr Ameerul Jamali", category: "Child Specialist", experience: 7, phone: "" },
        { name: "Dr Ali asgher Shaikh", category: "Child Specialist", experience: 6, phone: "" },
        { name: "Dr Amber Ali Siyal", category: "Child Specialist", experience: 5, phone: "" },
        { name: "Dr Sadiq Siyal", category: "Child Specialist", experience: 9, phone: "" },

        // Physician
        { name: "Prof: Rafique Memon", category: "Physician", experience: 15, phone: "" },
        { name: "Dr Shamsuddin Shaikh", category: "Physician", experience: 12, phone: "" },
        { name: "Prof: Nasrullah Amir", category: "Physician", experience: 14, phone: "" },
        { name: "Dr Anwar Ali Jamali", category: "Physician", experience: 10, phone: "" },
        { name: "Dr Khawar Hussain", category: "Physician", experience: 11, phone: "" },

        // Neurologist
        { name: "Dr Abdul Razaq Mari", category: "Neurologist", experience: 13, phone: "" },
        { name: "Dr Awais Bashir Larak", category: "Neurologist", experience: 9, phone: "" },
        { name: "Dr Noor Nabi Siyal", category: "Neurologist", experience: 8, phone: "" },

        // Cardiologist
        { name: "Dr Jagdeesh Khatri", category: "Cardiologist", experience: 14, phone: "" },
        { name: "Dr Zafar Iqbal", category: "Cardiologist", experience: 10, phone: "" },
        { name: "Dr Ilahi Bux", category: "Cardiologist", experience: 12, phone: "" },
        { name: "Dr Asad Khan", category: "Cardiologist", experience: 11, phone: "" },
        { name: "Prof Dr Tariq Mahmood", category: "Cardiologist", experience: 15, phone: "" }
    ];

    saveLocalDoctors(defaultDoctors);
}

// Setup autocomplete for doctor name input
function setupDoctorNameAutocomplete(inputElement) {
    const doctors = getLocalDoctors();
    const doctorNames = doctors.map(doc => doc.name);

    inputElement.setAttribute('list', 'doctor-names-list');

    let dataList = document.getElementById('doctor-names-list');
    if (!dataList) {
        dataList = document.createElement('datalist');
        dataList.id = 'doctor-names-list';
        document.body.appendChild(dataList);
    }

    dataList.innerHTML = '';
    doctorNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        dataList.appendChild(option);
    });
}

// Save doctors to localStorage
function saveLocalDoctors(doctors) {
    localStorage.setItem('localDoctors', JSON.stringify(doctors));
}

// Add new doctor from form
function addNewDoctor() {
    const form = document.getElementById('add-doctor-form');
    const name = form.doctorName.value.trim();
    const category = form.doctorCategory.value.trim();
    const experience = parseInt(form.doctorExperience.value);
    const phone = form.doctorPhone.value.trim();

    if (!name || !category || isNaN(experience) || !phone) {
        displayAddDoctorMessage('Please fill in all fields correctly.', true);
        return;
    }

    const newDoctor = { name, category, experience, phone };
    const doctors = getLocalDoctors();
    doctors.push(newDoctor);
    saveLocalDoctors(doctors);

    displayAddDoctorMessage('Doctor added successfully.', false);
    form.reset();

    // Refresh categories and doctors list
    loadDoctorCategories();
    loadDoctorsByCategory(category);
}

// Display message for add doctor form
function displayAddDoctorMessage(message, isError) {
    const messageDiv = document.getElementById('add-doctor-message');
    messageDiv.textContent = message;
    messageDiv.style.color = isError ? 'red' : 'green';
}

// Register patient
function registerPatient() {
    const form = document.getElementById('registration-form');
    const data = {
        patientName: form.patientName.value,
        fatherName: form.fatherName.value,
        cnic: form.cnic.value,
        phone: form.phone.value,
        age: parseInt(form.age.value),
        disease: form.disease.value
    };
    ajaxRequest('POST', '/patients/register', data, (status, response) => {
        const messageDiv = document.getElementById('registration-message');
        if (status === 200) {
            const res = JSON.parse(response);
            messageDiv.textContent = `Registration successful. Your Patient ID is ${res.patientId}`;
            form.reset();
        } else {
            messageDiv.textContent = 'Registration failed: ' + response;
        }
    });
}

// Login patient
function loginPatient() {
    const form = document.getElementById('login-form');
    const data = {
        loginCnic: form.loginCnic.value
    };
    ajaxRequest('POST', '/patients/login', data, (status, response) => {
        const messageDiv = document.getElementById('login-message');
        if (status === 200) {
            messageDiv.textContent = 'Login successful.';
            form.style.display = 'none';
            document.getElementById('symptom-checker').style.display = 'block';
            // Store patient ID for symptom checker
            const res = JSON.parse(response);
            window.loggedInPatientId = res.patientId;
        } else {
            messageDiv.textContent = 'Login failed: ' + response;
        }
    });
}

function checkSymptoms() {
    const form = document.getElementById('symptom-form');
    const symptomsInput = form.symptoms.value.toLowerCase();

    // Define symptom to specialty mapping
    const symptomSpecialtyMap = {
        "headache": "Neurologist",
        "dizziness": "Neurologist",
        "memory loss": "Neurologist",
        "chest pain": "Cardiologist",
        "shortness of breath": "Cardiologist",
        "heart palpitations": "Cardiologist",
        "fever": "Physician",
        "cough": "Physician",
        "fatigue": "Physician",
        "child illness": "Child Specialist",
        "child fever": "Child Specialist",
        "child cough": "Child Specialist"
    };

    // Find matching specialties
    let matchedSpecialties = new Set();
    for (const symptom in symptomSpecialtyMap) {
        if (symptomsInput.includes(symptom)) {
            matchedSpecialties.add(symptomSpecialtyMap[symptom]);
        }
    }

    const suggestionsDiv = document.getElementById('medicine-suggestions');
    if (matchedSpecialties.size === 0) {
        suggestionsDiv.textContent = "No matching specialty found for the given symptoms.";
        return;
    }

    // Get doctors matching the specialties
    const doctors = getLocalDoctors();
    let suggestedDoctors = [];
    matchedSpecialties.forEach(spec => {
        suggestedDoctors = suggestedDoctors.concat(doctors.filter(doc => doc.category === spec));
    });

    // Display suggested specialties and doctors
    let html = "<h3>Suggested Specialties and Doctors:</h3>";
    matchedSpecialties.forEach(spec => {
        html += `<h4>${spec}</h4><ul>`;
        suggestedDoctors.filter(doc => doc.category === spec).forEach(doc => {
            html += `<li>${doc.name} (Experience: ${doc.experience} years)</li>`;
        });
        html += "</ul>";
    });

    suggestionsDiv.innerHTML = html;
}