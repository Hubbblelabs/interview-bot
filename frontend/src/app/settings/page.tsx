"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { Profile } from "@/types";
import { Settings, Upload, User, Zap, CheckCircle, Loader2 } from "lucide-react";
import { PageSkeleton } from "@/components/Skeleton";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // New state variables for editable skills
  const [isEditingSkills, setIsEditingSkills] = useState(false);
  const [editableSkills, setEditableSkills] = useState<string[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  const [newSkillInput, setNewSkillInput] = useState("");

  // State variables for editable demographic details
  const [isEditingData, setIsEditingData] = useState(false);
  const [editableData, setEditableData] = useState({
    name: "",
    email: "",
    phone: "",
    location: ""
  });
  const [savingData, setSavingData] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get("/profile");
      setProfile(data);
      if (data.skills) {
        setEditableSkills(data.skills);
      }
      if (data.resume?.parsed_data) {
        setEditableData({
          name: data.resume.parsed_data.name || "",
          email: data.resume.parsed_data.email || "",
          phone: data.resume.parsed_data.phone || "",
          location: data.resume.parsed_data.location || ""
        });
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/resume/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadSuccess(true);
      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to upload resume");
    } finally {
      setUploading(false);
    }
  };

  // Profile Skills Editing Handlers
  const handleRemoveSkill = (indexToRemove: number) => {
    setEditableSkills(editableSkills.filter((_, i) => i !== indexToRemove));
  };

  const handleAddSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newSkillInput.trim() !== "") {
      e.preventDefault();
      if (!editableSkills.includes(newSkillInput.trim())) {
        setEditableSkills([...editableSkills, newSkillInput.trim()]);
      }
      setNewSkillInput("");
    }
  };

  const saveSkills = async () => {
    setSavingSkills(true);
    try {
      await api.put("/profile/skills", { skills: editableSkills });
      setProfile(prev => prev ? { ...prev, skills: editableSkills } : null);
      setIsEditingSkills(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update skills");
    } finally {
      setSavingSkills(false);
    }
  };

  const saveDetails = async () => {
    setSavingData(true);
    try {
      // Re-merge with existing data so we don't wipe out experience_summary, etc.
      const updatedParsedData = {
        ...profile?.resume?.parsed_data,
        ...editableData,
      };
      
      await api.put("/profile/resume-data", { parsed_data: updatedParsedData });
      
      setProfile((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          resume: {
            ...prev.resume,
            parsed_data: updatedParsedData
          }
        };
      });
      setIsEditingData(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update resume details");
    } finally {
      setSavingData(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      {loading ? (
        <PageSkeleton />
      ) : (
      <main className="pt-20 pb-12 px-4 max-w-3xl mx-auto">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border mb-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-muted" />
              <h2 className="text-lg font-semibold">Profile</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted">Name</span>
                <span className="text-sm font-medium">{profile?.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted">Email</span>
                <span className="text-sm font-medium">{profile?.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted">Role</span>
                <span className="text-sm font-medium capitalize">{profile?.role}</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-card border border-border mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Upload className="w-5 h-5 text-muted" />
              <h2 className="text-lg font-semibold">Resume</h2>
            </div>

            {profile?.resume ? (
              <div className="mb-4 p-4 rounded-lg bg-green-500/5 border border-green-500/15">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">Resume uploaded</span>
                </div>
                <p className="text-xs text-muted ml-6">{profile.resume.filename}</p>
              </div>
            ) : null}

            <label className="block">
              <div className="flex items-center gap-4">
                <div className="flex-1 p-4 rounded-lg border-2 border-dashed border-border hover:border-border-light transition-colors cursor-pointer text-center">
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-muted" />
                      <span className="text-sm text-muted">Uploading & parsing...</span>
                    </div>
                  ) : uploadSuccess ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-sm text-green-400">Resume processed!</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted mx-auto mb-2" />
                      <p className="text-sm text-muted">
                        {profile?.resume ? "Upload a new resume" : "Choose a file to upload"}
                      </p>
                      <p className="text-xs text-muted mt-1">PDF, DOC, DOCX, or TXT (max 5MB)</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>

          {/* New Personal Details Extracted Block */}
          {(profile?.resume?.parsed_data && Object.keys(profile.resume.parsed_data).length > 0) || isEditingData ? (
             <div className="p-6 rounded-xl bg-card border border-border mb-6">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                   <User className="w-5 h-5 text-muted" />
                   <h2 className="text-lg font-semibold">Resume Details</h2>
                 </div>
                 {!isEditingData ? (
                   <button
                     onClick={() => setIsEditingData(true)}
                     className="px-3 py-1.5 bg-white/5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors"
                   >
                     Edit
                   </button>
                 ) : (
                   <div className="flex items-center gap-2">
                     <button
                       onClick={() => setIsEditingData(false)}
                       disabled={savingData}
                       className="px-3 py-1.5 bg-transparent text-sm text-muted hover:text-white transition-colors"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={saveDetails}
                       disabled={savingData}
                       className="px-3 py-1.5 bg-white text-black font-medium rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                     >
                       {savingData ? (
                         <>
                           <Loader2 className="w-3 h-3 animate-spin" />
                           Saving...
                         </>
                       ) : (
                         "Save"
                       )}
                     </button>
                   </div>
                 )}
               </div>
               
               {!isEditingData ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <span className="text-xs text-muted font-medium">Full Name</span>
                     <p className="text-sm">{profile?.resume?.parsed_data?.name || "N/A"}</p>
                   </div>
                   <div className="space-y-1">
                     <span className="text-xs text-muted font-medium">Email</span>
                     <p className="text-sm">{profile?.resume?.parsed_data?.email || "N/A"}</p>
                   </div>
                   <div className="space-y-1">
                     <span className="text-xs text-muted font-medium">Phone Number</span>
                     <p className="text-sm">{profile?.resume?.parsed_data?.phone || "N/A"}</p>
                   </div>
                   <div className="space-y-1">
                     <span className="text-xs text-muted font-medium">Location</span>
                     <p className="text-sm">{profile?.resume?.parsed_data?.location || "N/A"}</p>
                   </div>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-xs text-muted font-medium block">Full Name</label>
                     <input
                       type="text"
                       value={editableData.name}
                       onChange={(e) => setEditableData(prev => ({ ...prev, name: e.target.value }))}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-muted font-medium block">Email</label>
                     <input
                       type="email"
                       value={editableData.email}
                       onChange={(e) => setEditableData(prev => ({ ...prev, email: e.target.value }))}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-muted font-medium block">Phone Number</label>
                     <input
                       type="text"
                       value={editableData.phone}
                       onChange={(e) => setEditableData(prev => ({ ...prev, phone: e.target.value }))}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-xs text-muted font-medium block">Location</label>
                     <input
                       type="text"
                       value={editableData.location}
                       onChange={(e) => setEditableData(prev => ({ ...prev, location: e.target.value }))}
                       className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                     />
                   </div>
                 </div>
               )}
             </div>
          ) : null}

          {(profile?.skills && profile.skills.length > 0) || isEditingSkills ? (
            <div className="p-6 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-muted" />
                  <h2 className="text-lg font-semibold">Extracted Skills</h2>
                </div>
                {!isEditingSkills ? (
                  <button
                    onClick={() => setIsEditingSkills(true)}
                    className="px-3 py-1.5 bg-white/5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingSkills(false)}
                      disabled={savingSkills}
                      className="px-3 py-1.5 bg-transparent text-sm text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveSkills}
                      disabled={savingSkills}
                      className="px-3 py-1.5 bg-white text-black font-medium rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {savingSkills ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                )}
              </div>
              
              {!isEditingSkills ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(profile?.clustered_skills && profile.clustered_skills.length > 0
                      ? profile.clustered_skills.map((item) => item.label)
                      : profile?.skills || []
                    ).map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-full bg-white/5 border border-border text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {profile?.clustered_skills && profile.clustered_skills.length > 0 ? (
                    <p className="text-xs text-muted">
                      Skills are grouped into clusters for cleaner interview targeting. Click Edit to manage raw skills.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {editableSkills.map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-full bg-white/5 border border-border text-sm flex items-center gap-2"
                      >
                        {skill}
                        <button
                          onClick={() => handleRemoveSkill(i)}
                          className="text-muted hover:text-red-400 transition-colors"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      onKeyDown={handleAddSkill}
                      placeholder="Type a skill and press Enter to add..."
                      className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm"
                    />
                    <p className="text-xs text-muted mt-2">These skills are used to customize your interview questions.</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
      )}
    </ProtectedRoute>
  );
}
