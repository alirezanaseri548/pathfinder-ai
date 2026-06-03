jsx
// src/components/ResumeForm.jsx
import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import logger from '../utils/logger';

/**
 * @typedef {Object} FormData
 * @property {string} fullName - Full name
 * @property {string} email - Email address
 * @property {string} phone - Phone number
 * @property {string} location - Location
 * @property {string} summary - Professional summary
 * @property {Array<{institution: string, degree: string, field: string, startDate: string, endDate: string, gpa: string}>} education - Education entries
 * @property {Array<{company: string, position: string, startDate: string, endDate: string, description: string, technologies: string}>} experience - Experience entries
 * @property {string} skills - Skills (comma separated)
 * @property {Array<{name: string, url: string, description: string, technologies: string}>} projects - Project entries
 * @property {string} githubUrl - GitHub profile URL
 * @property {Array<{title: string, description: string, date: string}>} achievements - Achievement entries
 * @property {Array<{name: string, issuer: string, date: string, url: string}>} certifications - Certification entries
 */

const initialFormData = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  education: [{ institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' }],
  experience: [{ company: '', position: '', startDate: '', endDate: '', description: '', technologies: '' }],
  skills: '',
  projects: [{ name: '', url: '', description: '', technologies: '' }],
  githubUrl: '',
  achievements: [{ title: '', description: '', date: '' }],
  certifications: [{ name: '', issuer: '', date: '', url: '' }]
};

const githubUrlRegex = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/;

const ResumeForm = ({ onUpdate }) => {
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    logger.info('ResumeForm mounted');
    return () => logger.info('ResumeForm unmounted');
  }, []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      onUpdate(updated);
      return updated;
    });
  }, [onUpdate]);

  const handleNestedChange = useCallback((section, index, field, value) => {
    setFormData(prev => {
      const updatedSection = [...prev[section]];
      updatedSection[index] = { ...updatedSection[index], [field]: value };
      const updated = { ...prev, [section]: updatedSection };
      onUpdate(updated);
      return updated;
    });
  }, [onUpdate]);

  const addEntry = useCallback((section) => {
    setFormData(prev => {
      const emptyEntry = section === 'education' 
        ? { institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' }
        : section === 'experience'
        ? { company: '', position: '', startDate: '', endDate: '', description: '', technologies: '' }
        : section === 'projects'
        ? { name: '', url: '', description: '', technologies: '' }
        : section === 'achievements'
        ? { title: '', description: '', date: '' }
        : { name: '', issuer: '', date: '', url: '' };
      
      const updated = { ...prev, [section]: [...prev[section], emptyEntry] };
      onUpdate(updated);
      return updated;
    });
  }, [onUpdate]);

  const removeEntry = useCallback((section, index) => {
    setFormData(prev => {
      if (prev[section].length <= 1) return prev;
      const updatedSection = prev[section].filter((_, i) => i !== index);
      const updated = { ...prev, [section]: updatedSection };
      onUpdate(updated);
      return updated;
    });
  }, [onUpdate]);

  const handleGithubUrlChange = useCallback((e) => {
    const value = e.target.value;
    if (value && !githubUrlRegex.test(value)) {
      logger.warn('Invalid GitHub URL format');
    }
    handleChange(e);
  }, [handleChange]);

  const renderSection = (title, sectionKey, fields, fieldLabels) => (
    <div className="form-section" key={sectionKey}>
      <h3>{title}</h3>
      {formData[sectionKey].map((entry, index) => (
        <div className="form-entry" key={index}>
          {fields.map((field, fIndex) => (
            <div className="form-group" key={field}>
              <label htmlFor={`${sectionKey}-${index}-${field}`}>
                {fieldLabels[fIndex]}
              </label>
              {field === 'description' || field === 'summary' ? (
                <textarea
                  id={`${sectionKey}-${index}-${field}`}
                  value={entry[field] || ''}
                  onChange={(e) => handleNestedChange(sectionKey, index, field, e.target.value)}
                  rows={3}
                />
              ) : (
                <input
                  type={field.includes('date') ? 'month' : 'text'}
                  id={`${sectionKey}-${index}-${field}`}
                  value={entry[field] || ''}
                  onChange={(e) => handleNestedChange(sectionKey, index, field, e.target.value)}
                />
              )}
            </div>
          ))}
          {formData[sectionKey].length > 1 && (
            <button
              type="button"
              className="btn-remove"
              onClick={() => removeEntry(sectionKey, index)}
              aria-label={`Remove ${title} entry ${index + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn-add"
        onClick={() => addEntry(sectionKey)}
      >
        Add {title}
      </button>
    </div>
  );

  return (
    <div className="resume-form" data-testid="resume-form">
      <h2>Resume Builder</h2>
      
      {/* Personal Information */}
      <div className="form-section">
        <h3>Personal Information</h3>
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="phone">Phone</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="location">Location</label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="summary">Professional Summary</label>
          <textarea
            id="summary"
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            rows={4}
          />
        </div>
      </div>

      {/* GitHub URL Input */}
      <div className="form-section">
        <h3>GitHub Profile</h3>
        <div className="form-group">
          <label htmlFor="githubUrl">GitHub URL</label>
          <input
            type="url"
            id="githubUrl"
            name="githubUrl"
            value={formData.githubUrl}
            onChange={handleGithubUrlChange}
            placeholder="https://github.com/username"
            pattern="https?://(www\.)?github\.com/[a-zA-Z0-9_-]+/?$"
          />
          <small className="form-hint">Enter your full GitHub profile URL</small>
        </div>
      </div>

      {/* Education Section */}
      {renderSection(
        'Education',
        'education',
        ['institution', 'degree', 'field', 'startDate', 'endDate', 'gpa'],
        ['Institution', 'Degree', 'Field of Study', 'Start Date', 'End Date', 'GPA']
      )}

      {/* Experience Section */}
      {renderSection(
        'Experience',
        'experience',
        ['company', 'position', 'startDate', 'endDate', 'description', 'technologies'],
        ['Company', 'Position', 'Start Date', 'End Date', 'Description', 'Technologies Used']
      )}

      {/* Skills Section */}
      <div className="form-section">
        <h3>Skills</h3>
        <div className="form-group">
          <label htmlFor="skills">Skills (comma separated)</label>
          <textarea
            id="skills"
            name="skills"
            value={formData.skills}
            onChange={handleChange}
            rows={3}
            placeholder="JavaScript, React, Node.js, Python"
          />
        </div>
      </div>

      {/* Projects Section */}
      {renderSection(
        'Projects',
        'projects',
        ['name', 'url', 'description', 'technologies'],
        ['Project Name', 'Project URL', 'Description', 'Technologies Used']
      )}

      {/* Achievements Section */}
      {renderSection(
        'Achievements',
        'achievements',
        ['title', 'description', 'date'],
        ['Title', 'Description', 'Date']
      )}

      {/* Certifications Section */}
      {renderSection(
        'Certifications',
        'certifications',
        ['name', 'issuer', 'date', 'url'],
        ['Certification Name', 'Issuer', 'Date', 'URL']
      )}
    </div>
  );
};

ResumeForm.propTypes = {
  onUpdate: PropTypes.func.isRequired
};

export default ResumeForm;