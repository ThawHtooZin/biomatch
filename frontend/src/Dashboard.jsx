import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import api from './api';
import FaceMatch from './FaceMatch';

const fetchCivilians = async (params = {}) => {
    const response = await api.get('/civilians', { params });
    return response.data;
};

const fetchCriminalFlags = async () => {
    const response = await api.get('/criminal-flags');
    return response.data;
};

const initialFlagForm = {
    nrc_number: '',
    status: 'WANTED',
    offense_title: '',
    is_wanted_or_restricted: true,
    gate_action: 'INTERCEPT',
};

const dashboardNoticeStyles = {
    danger: 'border-red-300 bg-red-50 text-red-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

const getDashboardNotice = (error, action) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;

    if (status === 401) return { tone: 'warning', title: 'Session expired', message: 'Sign in again before continuing.' };
    if (code === 'biometric_service_unavailable' || status === 503) {
        return { tone: 'danger', title: 'Biometric service unavailable', message: 'The service is offline or cannot reach the database. Start it and retry.' };
    }
    if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase().includes('timeout')) {
        return { tone: 'warning', title: 'Request timed out', message: 'The operation is taking longer than expected. Check the registry before retrying.' };
    }
    if (!error?.response) return { tone: 'danger', title: 'Connection lost', message: `Could not ${action}. Check that the backend is running and try again.` };

    return { tone: 'danger', title: 'Operation failed', message: `Could not ${action}. Try again; contact support if it continues.` };
};

function DashboardNotice({ notice }) {
    if (!notice) return null;

    return (
        <div role={notice.tone === 'danger' ? 'alert' : 'status'} aria-live="polite" className={`border-l-4 p-4 ${dashboardNoticeStyles[notice.tone] || dashboardNoticeStyles.info}`}>
            <p className="text-xs font-bold uppercase tracking-wider">{notice.title}</p>
            <p className="mt-1 text-sm leading-5">{notice.message}</p>
            {notice.failures?.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                    {notice.failures.slice(0, 10).map((failure) => (
                        <li key={failure.civ_id}><span className="font-semibold">{failure.full_name}:</span> {failure.message}</li>
                    ))}
                    {notice.failures.length > 10 && <li>And {notice.failures.length - 10} more records need attention.</li>}
                </ul>
            )}
        </div>
    );
}

const getStatusBadgeClass = (status) => {
    switch (status) {
        case 'WANTED':
            return 'bg-red-100 text-red-700';
        case 'CURRENTLY_CHARGED':
            return 'bg-amber-100 text-amber-700';
        case 'CONVICTED':
            return 'bg-orange-100 text-orange-700';
        case 'TRAVEL_RESTRICTED':
            return 'bg-sky-100 text-sky-700';
        case 'HEALTHY':
            return 'bg-emerald-100 text-emerald-800';
        default:
            return 'bg-emerald-100 text-emerald-700';
    }
};

export default function Dashboard() {
    const [civilians, setCivilians] = useState([]);
    const [criminalFlags, setCriminalFlags] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('civilians');
    const [editingFlag, setEditingFlag] = useState(null);
    const [isFlagFormOpen, setIsFlagFormOpen] = useState(false);
    const [flagForm, setFlagForm] = useState(initialFlagForm);
    const [selectedCivilian, setSelectedCivilian] = useState(null);
    const [civilianLookupQuery, setCivilianLookupQuery] = useState('');
    const [civilianLookupResults, setCivilianLookupResults] = useState([]);
    const [civilianLookupError, setCivilianLookupError] = useState('');
    const [isSearchingCivilians, setIsSearchingCivilians] = useState(false);
    const [civilianCursor, setCivilianCursor] = useState(null);
    const [hasMoreCivilians, setHasMoreCivilians] = useState(false);
    const [isLoadingMoreCivilians, setIsLoadingMoreCivilians] = useState(false);
    const [flagFormError, setFlagFormError] = useState('');
    const [loadError, setLoadError] = useState(null);
    const [generationNotice, setGenerationNotice] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [healthEligibilityNotice, setHealthEligibilityNotice] = useState(null);
    const [isRefreshingHealthEligibility, setIsRefreshingHealthEligibility] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (!token) return window.location.replace('/');

        fetchCriminalFlags()
            .then(setCriminalFlags)
            .catch((error) => {
                console.error('Failed to fetch criminal flags.', error.response?.data);
                setLoadError(getDashboardNotice(error, 'load criminal flags'));
            });
    }, []);

    useEffect(() => {
        let active = true;
        const search = searchQuery.trim();
        const pendingBiometricsOnly = activeTab === 'biometrics';

        if (search.length > 0 && search.length < 3) {
            setCivilians([]);
            setCivilianCursor(null);
            setHasMoreCivilians(false);
            return () => { active = false; };
        }

        const timer = window.setTimeout(async () => {
            try {
                const page = await fetchCivilians({
                    ...(search ? { search } : {}),
                    ...(pendingBiometricsOnly ? { pending_biometrics: 1 } : {}),
                });
                if (!active) return;
                setCivilians(page.data);
                setCivilianCursor(page.next_cursor);
                setHasMoreCivilians(page.has_more);
                setLoadError(null);
            } catch (error) {
                if (!active) return;
                console.error('Failed to fetch civilian page.', error.response?.data);
                setLoadError(getDashboardNotice(error, 'load civilians'));
            }
        }, search ? 300 : 0);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [searchQuery, activeTab]);

    useEffect(() => {
        if (!isFlagFormOpen || selectedCivilian) return undefined;

        const search = civilianLookupQuery.trim();
        if (search.length < 3) {
            setCivilianLookupResults([]);
            setCivilianLookupError('');
            setIsSearchingCivilians(false);
            return undefined;
        }

        let active = true;
        const timer = window.setTimeout(async () => {
            setIsSearchingCivilians(true);
            setCivilianLookupError('');
            try {
                const response = await api.get('/civilians/lookup', { params: { search } });
                if (active) setCivilianLookupResults(response.data.data);
            } catch (error) {
                if (active) {
                    setCivilianLookupResults([]);
                    setCivilianLookupError(getDashboardNotice(error, 'search civilians').message);
                }
            } finally {
                if (active) setIsSearchingCivilians(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [civilianLookupQuery, isFlagFormOpen, selectedCivilian]);

    const refreshData = async () => {
        const search = searchQuery.trim();
        const page = await fetchCivilians({
            ...(search.length >= 3 ? { search } : {}),
            ...(activeTab === 'biometrics' ? { pending_biometrics: 1 } : {}),
        });
        const flagRecords = await fetchCriminalFlags();
        setCivilians(page.data);
        setCivilianCursor(page.next_cursor);
        setHasMoreCivilians(page.has_more);
        setCriminalFlags(flagRecords);
        setLoadError(null);
    };

    const loadMoreCivilians = async () => {
        if (!civilianCursor || isLoadingMoreCivilians) return;

        setIsLoadingMoreCivilians(true);
        try {
            const search = searchQuery.trim();
            const page = await fetchCivilians({
                ...(search.length >= 3 ? { search } : {}),
                ...(activeTab === 'biometrics' ? { pending_biometrics: 1 } : {}),
                cursor: civilianCursor,
            });
            setCivilians((current) => [...current, ...page.data]);
            setCivilianCursor(page.next_cursor);
            setHasMoreCivilians(page.has_more);
        } catch (error) {
            setLoadError(getDashboardNotice(error, 'load more civilians'));
        } finally {
            setIsLoadingMoreCivilians(false);
        }
    };

    const handleRefreshHealthEligibility = async () => {
        setIsRefreshingHealthEligibility(true);
        setHealthEligibilityNotice({ tone: 'info', title: 'Refreshing healthy flags', message: 'Checking civilian dates of birth against the 18–35 eligibility range.' });

        try {
            const response = await api.post('/civilians/refresh-health-citizens');
            const {
                eligible_updated: eligibleUpdated = 0,
                no_longer_eligible: noLongerEligible = 0,
                eligible_total: eligibleTotal = 0,
            } = response.data;
            await refreshData();
            setHealthEligibilityNotice({
                tone: 'success',
                title: 'Healthy flags refreshed',
                message: `${eligibleTotal} currently flagged healthy; ${eligibleUpdated} added and ${noLongerEligible} removed in this refresh.`,
            });
        } catch (error) {
            setHealthEligibilityNotice(getDashboardNotice(error, 'refresh healthy flags'));
        } finally {
            setIsRefreshingHealthEligibility(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/civilians/${id}`);
            await refreshData();
        } catch (error) {
            console.error('Error deleting civilian.', error.response?.data);
            setLoadError(getDashboardNotice(error, 'delete this civilian'));
        }
    };

    const openCreateFlagForm = () => {
        setEditingFlag(null);
        setFlagForm(initialFlagForm);
        setSelectedCivilian(null);
        setCivilianLookupQuery('');
        setCivilianLookupResults([]);
        setFlagFormError('');
        setIsFlagFormOpen(true);
    };

    const openEditFlagForm = (flag) => {
        setEditingFlag(flag);
        setFlagForm({
            nrc_number: flag.nrc_number,
            status: flag.status,
            offense_title: flag.offense_title,
            is_wanted_or_restricted: Boolean(flag.is_wanted_or_restricted),
            gate_action: flag.gate_action,
        });
        setSelectedCivilian(flag.civilian || { nrc_number: flag.nrc_number, full_name: 'Selected civilian' });
        setCivilianLookupQuery('');
        setFlagFormError('');
        setIsFlagFormOpen(true);
    };

    const handleFlagFormChange = (event) => {
        const { name, value, checked, type } = event.target;
        setFlagForm((current) => ({
            ...current,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSaveFlag = async (event) => {
        event.preventDefault();
        setFlagFormError('');

        try {
            if (editingFlag) {
                await api.put(`/criminal-flags/${editingFlag.flag_id}`, flagForm);
            } else {
                await api.post('/criminal-flags', flagForm);
            }

            await refreshData();
            setIsFlagFormOpen(false);
        } catch (error) {
            console.error('Error saving criminal flag.', error.response?.data);
            setFlagFormError(getDashboardNotice(error, 'save this criminal flag').message);
        }
    };

    const handleDeleteFlag = async (flagId) => {
        if (!window.confirm('Delete this criminal flag?')) return;

        try {
            await api.delete(`/criminal-flags/${flagId}`);
            await refreshData();
        } catch (error) {
            console.error('Error deleting criminal flag.', error.response?.data);
            setLoadError(getDashboardNotice(error, 'delete this criminal flag'));
        }
    };

    const handleGenerateAll = async () => {
        setIsGenerating(true);
        setGenerationNotice({ tone: 'info', title: 'Generation started', message: 'Processing civilians without biometric profiles. This may take a while.' });

        try {
            const response = await api.post('/civilians/generate-embeddings');
            const { total = 0, generated = 0, skipped = 0, failed = 0, failures = [] } = response.data;
            setGenerationNotice({
                tone: failed > 0 ? 'warning' : 'success',
                title: failed > 0 ? 'Generation finished with issues' : 'Generation complete',
                message: `${generated} generated, ${skipped} already handled, ${failed} failed out of ${total}.`,
                failures,
            });

            try {
                await refreshData();
            } catch (refreshError) {
                setLoadError(getDashboardNotice(refreshError, 'refresh biometric status'));
            }
        } catch (error) {
            console.error('Bulk biometric generation failed.', error.response?.data);
            setGenerationNotice(getDashboardNotice(error, 'generate biometric profiles'));
        } finally {
            setIsGenerating(false);
        }
    };

    const query = searchQuery.trim().toLowerCase();
    const filteredCivilians = civilians;
    const filteredFlags = criminalFlags.filter((flag) => (
        flag.civilian?.full_name?.toLowerCase().includes(query) ||
        flag.nrc_number?.toLowerCase().includes(query) ||
        flag.status?.toLowerCase().includes(query) ||
        flag.offense_title?.toLowerCase().includes(query)
    ));
    const pendingBiometrics = filteredCivilians.filter((civilian) => (
        !civilian.has_biometrics
    ));
    const totalPendingBiometrics = civilians.filter((civilian) => (
        !civilian.has_biometrics
    )).length;

    return (
        <div className="min-h-screen bg-[#f5f4f0] font-sans text-gray-800 flex flex-col">
            <header className="bg-[#1d3557] text-white p-4 flex items-center border-b-[3px] border-[#b59a6d]">
                <div className="border border-white rounded-full w-9 h-9 flex items-center justify-center mr-4 text-sm font-semibold">R</div>
                <div>
                    <div className="text-xs text-gray-300 tracking-wide">Civil Registry Department</div>
                    <div className="text-xl font-serif font-bold tracking-wide">National Biometric Registry</div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-8 w-full grow">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <div className="flex flex-wrap gap-2 border-b border-gray-200">
                        <button
                            type="button"
                            onClick={() => setActiveTab('civilians')}
                            aria-pressed={activeTab === 'civilians'}
                            className={`px-4 py-2 text-sm font-medium ${activeTab === 'civilians' ? 'border-b-2 border-[#1d3557] text-[#1d3557]' : 'text-gray-500'}`}
                        >
                            Civilians
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('status')}
                            aria-pressed={activeTab === 'status'}
                            className={`px-4 py-2 text-sm font-medium ${activeTab === 'status' ? 'border-b-2 border-[#1d3557] text-[#1d3557]' : 'text-gray-500'}`}
                        >
                            Criminal flags
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('biometrics')}
                            aria-pressed={activeTab === 'biometrics'}
                            className={`px-4 py-2 text-sm font-medium ${activeTab === 'biometrics' ? 'border-b-2 border-[#1d3557] text-[#1d3557]' : 'text-gray-500'}`}
                        >
                            Biometrics pending
                        </button>
                    </div>

                    <div className="flex gap-4 items-center">
                        <input
                            type="text"
                            placeholder="Search name or ID"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-64 p-2 border border-gray-300 bg-white focus:outline-none focus:border-gray-400 text-sm"
                        />
                        <FaceMatch />
                        <Link to="/create" className="bg-[#1d3557] text-white px-6 py-2 text-sm font-semibold hover:bg-[#2a4a75] transition-colors">
                            New record
                        </Link>
                    </div>
                </div>

                {loadError && <div className="mb-4"><DashboardNotice notice={loadError} /></div>}

                <div className="bg-white border border-gray-200 shadow-sm min-h-100 flex flex-col">
                    {activeTab === 'civilians' ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#faf9f6] p-4">
                                <span className="text-sm text-gray-600">Civilian records</span>
                                <button type="button" onClick={handleRefreshHealthEligibility} disabled={isRefreshingHealthEligibility} className="border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                    {isRefreshingHealthEligibility ? 'Refreshing...' : 'Reload healthy flags'}
                                </button>
                            </div>
                            {healthEligibilityNotice && <div className="border-b border-gray-200 p-4"><DashboardNotice notice={healthEligibilityNotice} /></div>}
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-180 text-sm">
                                    <thead className="bg-[#faf9f6] text-left font-medium text-gray-500">
                                        <tr>
                                            <th className="border-b border-gray-200 p-4">Name</th>
                                            <th className="border-b border-gray-200 p-4">ID</th>
                                            <th className="border-b border-gray-200 p-4">Date of birth</th>
                                            <th className="border-b border-gray-200 p-4">Biometric</th>
                                            <th className="border-b border-gray-200 p-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredCivilians.map((civilian) => {
                                            const hasEmbedding = Boolean(civilian.has_biometrics);

                                            return (
                                                <tr key={civilian.civ_id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-medium text-gray-900">
                                                        <span>{civilian.full_name}</span>
                                                        {civilian.has_healthy_flag && <span className="ml-2 inline-flex bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">HEALTHY</span>}
                                                    </td>
                                                    <td className="p-4 text-gray-600">{civilian.nrc_number}</td>
                                                    <td className="p-4 text-gray-600">{civilian.dob}</td>
                                                    <td className="p-4">
                                                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium ${hasEmbedding ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {hasEmbedding ? 'On file' : 'Not set'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex gap-3">
                                                            <Link to={`/edit/${civilian.civ_id}`} className="font-semibold text-[#1d3557] hover:underline">Edit</Link>
                                                            <button type="button" onClick={() => handleDelete(civilian.civ_id)} className="font-semibold text-red-600 hover:underline">Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {hasMoreCivilians && <div className="border-t border-gray-100 p-4 text-center"><button type="button" onClick={loadMoreCivilians} disabled={isLoadingMoreCivilians} className="border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{isLoadingMoreCivilians ? 'Loading...' : 'Load more'}</button></div>}
                            {filteredCivilians.length === 0 && <p className="p-8 text-center text-sm text-gray-500">{searchQuery.trim().length > 0 && searchQuery.trim().length < 3 ? 'Type at least 3 characters to search civilians.' : 'No civilians found.'}</p>}
                        </>
                    ) : activeTab === 'status' ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#faf9f6] p-4">
                                <h2 className="text-sm font-semibold text-gray-700">Criminal flags</h2>
                                <button type="button" onClick={openCreateFlagForm} className="bg-[#1d3557] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a4a75]">
                                    Add flag
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-275 text-sm">
                                    <thead className="bg-white text-left font-medium text-gray-500">
                                        <tr>
                                            <th className="border-b border-gray-200 p-4">Person</th>
                                            <th className="border-b border-gray-200 p-4">Status</th>
                                            <th className="border-b border-gray-200 p-4">Offense</th>
                                            <th className="border-b border-gray-200 p-4">Wanted / restricted</th>
                                            <th className="border-b border-gray-200 p-4">Gate action</th>
                                            <th className="border-b border-gray-200 p-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredFlags.map((flag) => (
                                            <tr key={flag.flag_id} className="hover:bg-gray-50">
                                                <td className="p-4">
                                                    <div className="font-medium text-gray-900">{flag.civilian?.full_name || 'Unknown civilian'}</div>
                                                    <div className="mt-1 text-xs text-gray-500">{flag.nrc_number}</div>
                                                    {flag.status === 'HEALTHY' && <div className="mt-1 text-xs font-medium text-emerald-800">Airport health-service status</div>}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-medium ${getStatusBadgeClass(flag.status)}`}>{flag.status}</span>
                                                </td>
                                                <td className="p-4 text-gray-700">{flag.offense_title}</td>
                                                <td className="p-4 text-gray-700">{flag.is_wanted_or_restricted ? 'Yes' : 'No'}</td>
                                                <td className="p-4 text-gray-700">{flag.gate_action}</td>
                                                <td className="p-4">
                                                    {flag.status === 'HEALTHY' ? (
                                                        <span className="text-xs text-gray-500">Managed by refresh</span>
                                                    ) : (
                                                        <div className="flex gap-3">
                                                            <button type="button" onClick={() => openEditFlagForm(flag)} className="font-semibold text-[#1d3557] hover:underline">Edit</button>
                                                            <button type="button" onClick={() => handleDeleteFlag(flag.flag_id)} className="font-semibold text-red-600 hover:underline">Delete</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {filteredFlags.length === 0 && <p className="p-8 text-center text-sm text-gray-500">No criminal flags found.</p>}
                        </>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-[#faf9f6] p-4">
                                <span className="text-sm text-gray-600">{totalPendingBiometrics} shown</span>
                                <button type="button" onClick={handleGenerateAll} disabled={isGenerating || totalPendingBiometrics === 0} className="bg-[#1d3557] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a4a75] disabled:cursor-not-allowed disabled:opacity-50">
                                    {isGenerating ? 'Generating...' : 'Generate all biometrics'}
                                </button>
                            </div>
                            {generationNotice && <div className="border-b border-gray-200 p-4"><DashboardNotice notice={generationNotice} /></div>}
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-180 text-sm">
                                    <thead className="bg-[#faf9f6] text-left font-medium text-gray-500">
                                        <tr>
                                            <th className="border-b border-gray-200 p-4">Name</th>
                                            <th className="border-b border-gray-200 p-4">ID</th>
                                            <th className="border-b border-gray-200 p-4">Date of birth</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {pendingBiometrics.map((civilian) => (
                                            <tr key={civilian.civ_id} className="hover:bg-gray-50">
                                                <td className="p-4 font-medium text-gray-900">{civilian.full_name}</td>
                                                <td className="p-4 text-gray-600">{civilian.nrc_number}</td>
                                                <td className="p-4 text-gray-600">{civilian.dob}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {hasMoreCivilians && <div className="border-t border-gray-100 p-4 text-center"><button type="button" onClick={loadMoreCivilians} disabled={isLoadingMoreCivilians} className="border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{isLoadingMoreCivilians ? 'Loading...' : 'Load more'}</button></div>}
                            {pendingBiometrics.length === 0 && <p className="p-8 text-center text-sm text-gray-500">{searchQuery.trim().length > 0 && searchQuery.trim().length < 3 ? 'Type at least 3 characters to search pending civilians.' : 'No civilians are waiting for biometric generation.'}</p>}
                        </>
                    )}
                </div>
            </main>

            {isFlagFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setIsFlagFormOpen(false);
                }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="flag-form-title" className="my-auto w-full max-w-xl border border-gray-200 bg-white shadow-xl">
                        <form onSubmit={handleSaveFlag}>
                            <div className="border-b border-gray-200 px-6 py-4">
                                <h2 id="flag-form-title" className="text-lg font-semibold text-gray-900">{editingFlag ? 'Edit criminal flag' : 'Add criminal flag'}</h2>
                            </div>
                            <div className="grid gap-4 p-6 sm:grid-cols-2">
                                <label className="relative text-sm font-medium text-gray-700 sm:col-span-2">
                                    Civilian
                                    {selectedCivilian ? (
                                        <div className="mt-1 flex items-center justify-between gap-3 border border-gray-300 bg-gray-50 p-3">
                                            <div className="min-w-0"><p className="truncate font-semibold text-gray-900">{selectedCivilian.full_name}</p><p className="text-xs text-gray-600">{selectedCivilian.nrc_number}</p></div>
                                            {!editingFlag && <button type="button" onClick={() => { setSelectedCivilian(null); setFlagForm((current) => ({ ...current, nrc_number: '' })); }} className="shrink-0 text-sm font-semibold text-[#1d3557] hover:underline">Change</button>}
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                type="search"
                                                role="combobox"
                                                aria-autocomplete="list"
                                                aria-expanded={civilianLookupResults.length > 0}
                                                aria-controls="civilian-lookup-results"
                                                value={civilianLookupQuery}
                                                onChange={(event) => setCivilianLookupQuery(event.target.value)}
                                                placeholder="Search by name or NRC (3+ characters)"
                                                className="mt-1 w-full border border-gray-300 bg-white p-2.5 text-sm"
                                            />
                                            {isSearchingCivilians && <p className="mt-1 text-xs text-gray-500">Searching civilians...</p>}
                                            {civilianLookupError && <p role="alert" className="mt-1 text-xs text-red-700">{civilianLookupError}</p>}
                                            {civilianLookupQuery.trim().length > 0 && civilianLookupQuery.trim().length < 3 && <p className="mt-1 text-xs text-gray-500">Enter at least 3 characters.</p>}
                                            {civilianLookupResults.length > 0 && (
                                                <ul id="civilian-lookup-results" role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto border border-gray-300 bg-white shadow-lg">
                                                    {civilianLookupResults.map((civilian) => (
                                                        <li key={civilian.civ_id}>
                                                            <button type="button" role="option" aria-selected="false" onClick={() => {
                                                                setSelectedCivilian(civilian);
                                                                setFlagForm((current) => ({ ...current, nrc_number: civilian.nrc_number }));
                                                                setCivilianLookupQuery('');
                                                                setCivilianLookupResults([]);
                                                            }} className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100">
                                                                <span className="block font-semibold text-gray-900">{civilian.full_name}</span>
                                                                <span className="block text-xs text-gray-600">{civilian.nrc_number}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {!isSearchingCivilians && civilianLookupQuery.trim().length >= 3 && !civilianLookupError && civilianLookupResults.length === 0 && <p className="mt-1 text-xs text-gray-500">No matching civilians found.</p>}
                                        </>
                                    )}
                                </label>
                                <label className="text-sm font-medium text-gray-700">
                                    Status
                                    <select name="status" value={flagForm.status} onChange={handleFlagFormChange} required className="mt-1 w-full border border-gray-300 bg-white p-2.5 text-sm">
                                        <option value="WANTED">Wanted</option>
                                        <option value="CURRENTLY_CHARGED">Currently charged</option>
                                        <option value="CONVICTED">Convicted</option>
                                        <option value="TRAVEL_RESTRICTED">Travel restricted</option>
                                    </select>
                                </label>
                                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                                    Offense title
                                    <input name="offense_title" value={flagForm.offense_title} onChange={handleFlagFormChange} required maxLength={150} className="mt-1 w-full border border-gray-300 bg-white p-2.5 text-sm" />
                                </label>
                                <label className="text-sm font-medium text-gray-700">
                                    Gate action
                                    <select name="gate_action" value={flagForm.gate_action} onChange={handleFlagFormChange} required className="mt-1 w-full border border-gray-300 bg-white p-2.5 text-sm">
                                        <option value="INTERCEPT">Intercept</option>
                                        <option value="SECONDARY_SCREENING">Secondary screening</option>
                                        <option value="ALLOW">Allow</option>
                                    </select>
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                                    <input type="checkbox" name="is_wanted_or_restricted" checked={flagForm.is_wanted_or_restricted} onChange={handleFlagFormChange} className="h-4 w-4 accent-[#1d3557]" />
                                    Wanted or travel restricted
                                </label>
                                {flagFormError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{flagFormError}</p>}
                            </div>
                            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                                <button type="button" onClick={() => setIsFlagFormOpen(false)} className="border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                                <button type="submit" disabled={!selectedCivilian} className="bg-[#1d3557] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a4a75] disabled:cursor-not-allowed disabled:opacity-50">
                                    {editingFlag ? 'Save changes' : 'Create flag'}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </div>
    );
}