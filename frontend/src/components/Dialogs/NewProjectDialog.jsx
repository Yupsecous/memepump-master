import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FaCheck, FaExclamationTriangle, FaRegCopy, FaTelegram } from "react-icons/fa";
import Modal from "../Base/Modal";
import { ellipsisAddress } from "../../utils/methods";

export default function NewProjectDialog({ isOpen, createProject, checkProject, onDone, onCancel, initialData }) {
    const steps = [
        "Create",
        "Activate",
        "Completed",
    ];
    const [step, setStep] = useState(0);
    const [projectName, setProjectName] = useState("");
    const [creating, setCreating] = useState(false);
    const [depositWallet, setDepositWallet] = useState("");
    const [expireTime, setExpireTime] = useState(-1);
    const [intervalId, setIntervalId] = useState(null);
    const [copied, setCopied] = useState(false);

    const expireTimeMin = Math.floor(expireTime / 60000);
    const expireTimeSec = Math.floor(expireTime / 1000) % 60;
    const visiblePayment = process.env.REACT_APP_NEW_PROJECT_PAYMENT === "true";

    useEffect(() => {
        setStep(initialData.step);
        setProjectName(initialData.projectName);
    }, [initialData]);

    const copyToClipboard = async (key, text) => {
        if ('clipboard' in navigator) {
            await navigator.clipboard.writeText(text);
            toast.success("Copied");
            setCopied({
                ...copied,
                [key]: true,
            });
            setTimeout(() => setCopied({
                ...copied,
                [key]: false,
            }), 2000);
        }
        else
            console.error('Clipboard not supported');
    };

    // const reset = () => {
    //     setStep(0);
    //     setProjectName("");
    //     setCreating(false);
    //     setDepositWallet("");
    //     setExpireTime(-1);
    // };

    const handleDone = () => {
        if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
        }
        onDone();
        // reset();
    };

    const handleCancel = () => {
        if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
        }
        onCancel();
        // reset();
    };

    const handleRetry = () => {
        if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
        }
        // reset();
    };

    const handleCheck = (projectId) => {
        const id = setInterval(async () => {
            console.log("Checking...", projectId);
            const data = await checkProject(projectId);
            if (data.activated) {
                clearInterval(id);
                setIntervalId(null);
                setStep(2);
            }
            else if (data.expired || data.error) {
                clearInterval(id);
                setIntervalId(null);
                setStep(3);
            }
            else
                setExpireTime(data.expireTime);
        }, 1000);
        setIntervalId(id);
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const data = await createProject(projectName);
            if (!data.error) {
                setStep(1);
                if (visiblePayment)
                    setDepositWallet(data.depositWallet);
                setExpireTime(data.expireTime);
                handleCheck(data.projectId);
            }
            else {
                console.log(data.error);
                toast.warn("Failed to create new project");
            }
        }
        catch (err) {
            console.log(err);
        }
        setCreating(false);
    };

    return (
        <Modal isOpen={isOpen}>
            <div className="flex flex-col pt-5 w-[440px] font-sans">
                <div className="flex items-center justify-start w-full h-auto px-5 py-3 rounded-t-md bg-gray-highlight">
                    <div className="font-sans text-sm font-medium text-white uppercase">
                        New Project
                    </div>
                </div>
                <div className="items-center w-full h-auto px-5 py-5 md:py-0 bg-gray-dark rounded-b-md">
                    <ul className="relative flex flex-row px-3 mt-7 gap-x-2">
                        {
                            steps.map((item, index) => {
                                return (
                                    <li key={index} className={`flex ${index < 2 ? "flex-1" : ""} items-center gap-x-2 shrink basis-0`}>
                                        <span className="inline-flex items-center text-xs align-middle min-w-7 min-h-7">
                                            <span className={`flex items-center text-sm justify-center flex-shrink-0 font-bold rounded-full size-7 ${index <= step ? (step === 3 && index === 2 ? "text-white bg-red-normal" : "text-gray-dark bg-green-normal") : "text-gray-normal bg-gray-highlight"}`}>
                                                {
                                                    step === 2 && index === 2 ?
                                                        (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) :
                                                        step === 3 && index === 2 ?
                                                            (
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M18 6 6 18"></path>
                                                                    <path d="m6 6 12 12"></path>
                                                                </svg>
                                                            ) :
                                                            (
                                                                <span className="">
                                                                    {index + 1}
                                                                </span>
                                                            )
                                                }

                                                <svg className="flex-shrink-0 hidden size-3"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="24"
                                                    height="24"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            </span>
                                            <span className={`text-sm font-medium ms-2 ${index <= step ? index === step ? "text-white" : "text-green-normal" : "text-gray-500"}`}>
                                                {step === 3 && index === 2 ? "Failed" : item}
                                            </span>
                                        </span>
                                        {index < 2 && <div className={`"flex-1 w-6 h-px ${index + 1 <= step ? "bg-green-normal" : "bg-gray-border"}`} />}
                                    </li>
                                );
                            })
                        }
                    </ul>
                    <div className="my-6">
                        {
                            step === 0 &&
                            (
                                <div className="flex flex-col">
                                    <div className="mt-4">
                                        <div className="font-sans text-xs uppercase text-gray-normal">
                                            Project Name<span className="pl-1 text-red-normal">*</span>
                                        </div>
                                        <input
                                            className="outline-none border border-gray-border font-sans text-white placeholder:text-gray-border text-sm px-2.5 bg-transparent w-full h-button mt-1"
                                            placeholder="Enter Name"
                                            onChange={(e) => setProjectName(e.target.value)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-center gap-5 my-5">
                                        <button
                                            className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-red-normal active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-white disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            onClick={handleCreate} disabled={creating || projectName === ""}
                                        >
                                            {creating ?
                                                <img src="/assets/spinner-white.svg" className="w-10 h-10" alt="spinner" /> :
                                                "Create"
                                            }
                                        </button>
                                        <button
                                            className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-[#262626] active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-gray-border disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            disabled={creating}
                                            onClick={handleCancel}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )
                        }
                        {
                            step === 1 &&
                            (
                                <div className="">
                                    <div className="flex items-center justify-center">
                                        <img src="/assets/spinner-white.svg" className="w-7 h-7" alt="spinner" />
                                        <label className="block text-sm text-gray-normal">
                                            { visiblePayment ? "Checking payment..." : "Pending activation by administrator..." }
                                        </label>
                                    </div>
                                    {
                                        expireTime > 0 &&
                                        <p className="m-auto text-sm font-normal text-center text-gray-normal">
                                            Expires in <span className="pl-1 text-lg text-white">{expireTimeMin}</span> minutes <span className="pl-1 text-lg text-white">{expireTimeSec}</span> seconds
                                        </p>
                                    }
                                    {
                                        <div className="flex m-auto items-center gap-2 justify-center">
                                            <p className="text-sm font-normal text-center text-gray-normal">
                                                Contact:
                                            </p>
                                            <a href="https://t.me/web3dev93"><FaTelegram className="w-5 h-5 text-white" /></a>
                                        </div>
                                    }
                                    {
                                        visiblePayment &&
                                        <div className="flex items-center justify-center gap-2 mt-7">
                                            <div className="text-sm text-gray-normal">
                                                Address:&nbsp;
                                                <span className="pl-1 text-white">
                                                    {
                                                        depositWallet !== "" ?
                                                            ellipsisAddress(depositWallet) :
                                                            "0x1234...5678"
                                                    }
                                                </span>
                                            </div>
                                            {
                                                (copied["address"] ?
                                                    (<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>) :
                                                    (<FaRegCopy className="w-3.5 h-3.5 transition ease-in-out transform cursor-pointer active:scale-95 duration-90 text-gray-normal" onClick={() => copyToClipboard("address", depositWallet)} />))
                                            }
                                        </div>
                                    }
                                    {
                                        visiblePayment &&
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="text-sm text-gray-normal">
                                                Service Fee:&nbsp;
                                                <span className="pl-1 text-yellow-normal">1 SOL</span>
                                            </div>
                                            {
                                                (copied["fee"] ?
                                                    (<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>) :
                                                    (<FaRegCopy className="w-3.5 h-3.5 transition ease-in-out transform cursor-pointer active:scale-95 duration-90 text-gray-normal" onClick={() => copyToClipboard("fee", "3")} />))
                                            }
                                        </div>
                                    }
                                    <div className="flex justify-center mt-7">
                                        <button
                                            className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-[#262626] active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-gray-border disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            onClick={handleCancel}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )
                        }
                        {
                            (step === 2 || step === 3) &&
                            (
                                <div className="">
                                    <div className="">
                                        {
                                            step === 2 ?
                                                (<p className="flex items-center justify-center gap-2 my-5 text-lg font-bold text-center uppercase text-green-normal">
                                                    <FaCheck />
                                                    Success!
                                                </p>) :
                                                (<p className="flex items-center justify-center gap-2 my-5 text-lg font-bold text-center uppercase text-red-normal">
                                                    <FaExclamationTriangle />
                                                    Failed!
                                                </p>)
                                        }
                                    </div>
                                    {
                                        step === 2 ?
                                            (
                                                <div className="flex justify-center">
                                                    <button
                                                        className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-[#262626] active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-gray-border disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                        onClick={handleDone}>
                                                        Done
                                                    </button>
                                                </div>
                                            ) :
                                            (
                                                <div className="flex justify-center gap-5">
                                                    <button
                                                        className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-red-normal active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-gray-border disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                        onClick={handleRetry}>
                                                        Retry
                                                    </button>
                                                    <button
                                                        className="pl-3 pr-4 h-button grow rounded-[4px] justify-center items-center gap-1 inline-flex bg-[#262626] active:scale-95 transition duration-90 ease-in-out transform focus:outline-none text-xs font-medium text-center text-white uppercase disabled:text-gray-border disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                        onClick={handleCancel}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            )
                                    }

                                </div>
                            )
                        }
                    </div>
                </div>
            </div>
        </Modal>
    );
}
