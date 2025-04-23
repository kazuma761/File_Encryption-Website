import { Authenticated, Unauthenticated, useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster, toast } from "sonner";
import { useState } from "react";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  return (
    <div className="min-h-screen space-bg">
      <header className="sticky top-0 z-10 glass-card p-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold neon-text">Secure File Encryption</h2>
        <SignOutButton />
      </header>
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const files = useQuery(api.files.listFiles);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const storeFile = useMutation(api.files.storeFile);
  const processFile = useAction(api.files.processFile);
  const deleteFile = useMutation(api.files.deleteFile);

  const [selectedFile, setSelectedFile] = useState<Id<"files"> | null>(null);
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--neon-cyan)]"></div>
      </div>
    );
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      
      if (!result.ok) throw new Error("Upload failed");
      
      const { storageId } = await result.json();
      await storeFile({
        storageId,
        name: file.name,
        isEncrypted: false,
        originalName: file.name,
      });
      
      toast.success("File uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload file");
      console.error(error);
    }
  };

  const handleProcess = async (operation: "encrypt" | "decrypt") => {
    if (!selectedFile || !password) return;
    
    setIsProcessing(true);
    try {
      await processFile({
        fileId: selectedFile,
        password,
        operation,
      });
      setSelectedFile(null);
      setPassword("");
      toast.success(`File ${operation}ed successfully`);
    } catch (error) {
      toast.error(`Failed to ${operation} file`);
      console.error(error);
    }
    setIsProcessing(false);
  };

  const handleDelete = async (fileId: Id<"files">) => {
    try {
      await deleteFile({ fileId });
      toast.success("File deleted successfully");
    } catch (error) {
      toast.error("Failed to delete file");
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center py-16">
        <h1 className="text-6xl font-bold neon-text mb-4 tracking-tight">
          Secure File Encryption System
        </h1>
        <Authenticated>
          <p className="text-xl text-[var(--neon-cyan)]">
            Welcome, {loggedInUser?.email ?? "friend"}!
          </p>
        </Authenticated>
        <Unauthenticated>
          <p className="text-xl text-[var(--neon-cyan)] mb-8">
            Partner with us for advanced application security and a digitally secure tomorrow.
          </p>
          <div className="float-animation">
            <svg className="mx-auto w-64 h-64" viewBox="0 0 200 200">
              {/* Simple astronaut SVG */}
              <circle cx="100" cy="100" r="50" fill="rgba(255,255,255,0.1)" stroke="var(--neon-cyan)" strokeWidth="2"/>
              <circle cx="100" cy="80" r="30" fill="rgba(255,255,255,0.2)" stroke="var(--neon-cyan)" strokeWidth="2"/>
              <path d="M70 110 Q100 140 130 110" stroke="var(--neon-green)" strokeWidth="2" fill="none"/>
            </svg>
          </div>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <div className="glass-card p-8 rounded-lg">
          <SignInForm />
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="space-y-8">
          <div className="glass-card p-8 rounded-lg">
            <label className="flex flex-col gap-2">
              <span className="font-medium text-[var(--neon-cyan)]">Upload a file:</span>
              <input
                type="file"
                onChange={handleFileUpload}
                className="file:neon-button file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 
                         file:text-sm file:font-semibold hover:file:cursor-pointer"
              />
            </label>
          </div>

          {files && files.length > 0 && (
            <div className="glass-card p-8 rounded-lg space-y-4">
              <h2 className="text-2xl font-semibold text-[var(--neon-cyan)]">Your Files</h2>
              <div className="grid gap-4">
                {files.map((file) => (
                  <div
                    key={file._id}
                    className={`p-4 rounded-lg glass-card ${
                      selectedFile === file._id ? "neon-border" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[var(--neon-green)]">{file.name}</p>
                        <p className="text-sm text-[var(--neon-cyan)]">
                          {file.isEncrypted ? "Encrypted" : "Not encrypted"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={file.url}
                          download={file.name}
                          className="neon-button px-3 py-1 text-sm rounded-full"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => setSelectedFile(file._id)}
                          className="neon-button px-3 py-1 text-sm rounded-full"
                        >
                          {file.isEncrypted ? "Decrypt" : "Encrypt"}
                        </button>
                        <button
                          onClick={() => handleDelete(file._id)}
                          className="px-3 py-1 text-sm rounded-full border-2 border-red-500 text-red-500 
                                   hover:bg-red-500 hover:text-white transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {selectedFile === file._id && (
                      <div className="mt-4 flex gap-4">
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="flex-1 px-3 py-1 rounded bg-transparent neon-border text-white"
                        />
                        <button
                          onClick={() =>
                            handleProcess(file.isEncrypted ? "decrypt" : "encrypt")
                          }
                          disabled={!password || isProcessing}
                          className="neon-button px-4 py-1 rounded disabled:opacity-50"
                        >
                          {isProcessing
                            ? "Processing..."
                            : file.isEncrypted
                            ? "Decrypt"
                            : "Encrypt"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Authenticated>
    </div>
  );
}
