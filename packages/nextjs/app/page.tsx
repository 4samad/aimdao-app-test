"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Address } from "~~/components/scaffold-eth";
import {
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWatchContractEvent,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";

type ProposalResult = {
  proposal: string;
  result: string;
  completed: boolean;
};

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [proposal, setProposal] = useState<string>("");
  const [requestId, setRequestId] = useState<bigint | null | undefined>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resultData, setResultData] = useState<ProposalResult | null>(null);
  const [shownEvents, setShownEvents] = useState(4);

  // Read the constitution
  const { data: constitution } = useScaffoldReadContract({
    contractName: "AimEvaluator",
    functionName: "constitution",
  });

  // Read if constitution is set
  const { data: constitutionSet } = useScaffoldReadContract({
    contractName: "AimEvaluator",
    functionName: "constitutionSet",
  });

  // Get fee estimate
  const { data: feeEstimate } = useScaffoldReadContract({
    contractName: "AimEvaluator",
    functionName: "estimateFee",
  });

  // Read function to get proposal result
  const { data: proposalResult, refetch: refetchResult } = useScaffoldReadContract({
    contractName: "AimEvaluator",
    functionName: "getProposalResult",
    args: [requestId || undefined],
  });

  const { writeContractAsync: writeAimEvaluatorAsync } = useScaffoldWriteContract({
    contractName: "AimEvaluator",
  });

  // Check proposal result
  const checkProposalResult = async (id: bigint) => {
    setIsLoading(true);
    try {
      await refetchResult();
      if (proposalResult && Array.isArray(proposalResult) && proposalResult.length >= 3) {
        setResultData({
          proposal: proposalResult[0] as string,
          result: proposalResult[1] as string,
          completed: proposalResult[2] as boolean,
        });
      }
    } catch (error) {
      console.error("Error checking result:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle proposal submission
  const handleSubmitProposal = async () => {
    if (!proposal || !constitution || !constitutionSet) return;

    setIsLoading(true);
    try {
      await writeAimEvaluatorAsync({
        functionName: "evaluateProposal",
        args: [proposal],
        value: feeEstimate || BigInt(0),
      });
    } catch (error) {
      console.error("Error submitting proposal:", error);
      setIsLoading(false);
    }
  };

  // Watch for ProposalSubmitted events to get the requestId
  useScaffoldWatchContractEvent({
    contractName: "AimEvaluator",
    eventName: "ProposalSubmitted",
    onLogs: logs => {
      logs.forEach(log => {
        const { requestId: newRequestId, proposer, proposal: submittedProposal } = log.args;
        console.log(newRequestId, proposer, submittedProposal);
        // If this is a new submission from the connected address, update our requestId
        if (proposer === connectedAddress && proposal === submittedProposal) {
          setRequestId(newRequestId);
          if (newRequestId) {
            checkProposalResult(newRequestId);
          }
        }
      });
    },
  });

  // Events History
  const { data: proposalEvents } = useScaffoldEventHistory({
    contractName: "AimEvaluator",
    eventName: "ProposalEvaluated",
    fromBlock: BigInt(0),
    watch: true,
  });

  // Effect to poll for results when request is pending
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (requestId && (!resultData || !resultData.completed)) {
      intervalId = setInterval(() => {
        checkProposalResult(requestId);
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [requestId, resultData]);

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 py-10 px-4 font-mono">
        {/* Constitution Column */}
        <div className="col-span-1 bg-base-100 rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Constitution</h2>
          {constitutionSet ? (
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap bg-base-200 p-4 rounded-lg">{constitution as string}</pre>
            </div>
          ) : (
            <div className="alert alert-warning">
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current flex-shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>No constitution has been set yet.</span>
              </div>
            </div>
          )}
        </div>

        {/* Proposal Column */}
        <div className="col-span-1 bg-base-100 rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Submit Proposal</h2>

          <div className="my-4">
            <div className="text-xs">Fee Estimate: {feeEstimate ? `${feeEstimate.toString()} wei` : "Loading..."}</div>
          </div>

          {!constitutionSet ? (
            <div className="alert alert-error">
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current flex-shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Constitution must be set before submitting proposals.</span>
              </div>
            </div>
          ) : (
            <>
              <textarea
                className="textarea textarea-bordered w-full h-40 rounded"
                placeholder="Enter your proposal here..."
                value={proposal}
                onChange={e => setProposal(e.target.value)}
                disabled={isLoading}
              />

              <button
                className="btn btn-primary mt-4 w-full"
                onClick={handleSubmitProposal}
                disabled={!proposal || isLoading || !connectedAddress}
              >
                {isLoading ? (
                  <>
                    <span className="loading loading-spinner"></span>
                    Submitting...
                  </>
                ) : (
                  "Submit Proposal"
                )}
              </button>

              {!connectedAddress && (
                <div className="alert alert-info mt-4">
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      className="stroke-current flex-shrink-0 w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                    <span>Please connect your wallet to submit proposals.</span>
                  </div>
                </div>
              )}
            </>
          )}
          {/* Result Display */}
          {resultData && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-2">Proposal Result</h3>
              <div className="bg-base-200 p-4 rounded-lg">
                <div className="mb-2">
                  <span className="font-bold">Status:</span> {resultData.completed ? "Completed" : "Pending"}
                </div>
                {resultData.completed ? (
                  <div className="mb-2">
                    <span className="font-bold">Decision:</span>
                    <span
                      className={`ml-2 badge ${resultData.result.toLowerCase().includes("approved") ? "badge-success" : "badge-error"}`}
                    >
                      {resultData.result}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="loading loading-spinner mr-2"></span>
                    Waiting for AI evaluation...
                    <button
                      className="btn btn-ghost btn-sm ml-auto"
                      onClick={() => requestId && checkProposalResult(requestId)}
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Events Column */}
        <div className="col-span-1 bg-base-100 rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Recent Proposals</h2>
          <div>
            {proposalEvents && proposalEvents.length > 0 ? (
              <div className="overflow-y-auto max-h-100">
                {proposalEvents.slice(0, shownEvents).map((event, index) => (
                  <div key={index} className="mb-3 p-3 bg-base-200 rounded-lg">
                    <div className="mb-1">
                      <span className="font-bold">Request ID:</span> {event?.args.requestId?.toString()}
                    </div>
                    <div className="mb-1">
                      <span className="font-bold">Proposer:</span> <Address address={event?.args.proposer} />
                    </div>
                    <div className="mb-1">
                      <span className="font-bold">Proposal:</span>
                      <div className="mt-1 text-sm bg-base-300 p-2 rounded-lg whitespace-pre-wrap">
                        {event?.args.proposal && event?.args.proposal.length > 100
                          ? `${event?.args.proposal.substring(0, 100)}...`
                          : event?.args.proposal}
                      </div>
                    </div>
                    <div className="mb-1">
                      <span className="font-bold">Result:</span>
                      <span
                        className={`ml-2 badge ${event?.args.result?.toLowerCase().includes("approved") ? "badge-success" : "badge-error"}`}
                      >
                        {event?.args.result}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm italic">No proposal evaluations yet</div>
            )}
            {proposalEvents && proposalEvents.length > shownEvents && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShownEvents(shownEvents + 4);
                }}
              >
                Show more
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
