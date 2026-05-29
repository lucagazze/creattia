import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Instagram, Heart, MessageCircle, Layers, Loader2, RefreshCw, X, 
  ArrowUpRight, AlertCircle, MessageSquare, CheckCircle2, ThumbsUp, Inbox, Info, Sparkles,
  Search, Copy, Send, Check, ShoppingBag, Link
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds } from '../services/metaAds';
import EmailLoader from '../components/ui/EmailLoader';

export default function MensajeriaPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const location = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Loading and Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [inboxReplies, setInboxReplies] = useState<Record<string, string>>({});
  const [submittingInboxReply, setSubmittingInboxReply] = useState<Record<string, boolean>>({});
  const [inboxReplyErrors, setInboxReplyErrors] = useState<Record<string, string | null>>({});
  const [loadingDraft, setLoadingDraft] = useState<Record<string, boolean>>({});

  // Filter States
  const [inboxSection, setInboxSection] = useState<'messages' | 'comments'>(() => {
    const searchParams = new URLSearchParams(location.search);
    const sec = searchParams.get('section');
    if (sec === 'comments') return 'comments';
    return 'messages';
  });

  // Sync tab with URL search parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const sec = searchParams.get('section');
    if (sec === 'comments') {
      setInboxSection('comments');
    } else if (sec === 'messages') {
      setInboxSection('messages');
    }
  }, [location.search]);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [inboxMode, setInboxMode] = useState<'pending' | 'all'>('pending');

  // Comment Moderations local states
  const [activeReplyCommentIds, setActiveReplyCommentIds] = useState<Record<string, boolean>>({});
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});
  const [likingCommentIds, setLikingCommentIds] = useState<Record<string, boolean>>({});
  const [bulkDraftsLoading, setBulkDraftsLoading] = useState(false);

  // Selected Item for Detail Slide-Over
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Shopify Products States
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);

  // Resolve IDs and keys from client profile
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const fbPageId = (profile as any)?.fb_page_id;
  const metaAccountId = (profile as any)?.meta_account_id;
  const ecommercePlatform = (profile as any)?.ecommerce_platform;
  const shopifyDomain = (profile as any)?.shopify_domain;
  const shopifyAccessToken = (profile as any)?.shopify_access_token;

  // Track page ID in localStorage to enable token retrieval in services
  useEffect(() => {
    if (fbPageId) {
      localStorage.setItem('active_fb_page_id', fbPageId);
    }
  }, [fbPageId]);

  // Load Shopify products via proxy if integrated
  useEffect(() => {
    if (ecommercePlatform === 'shopify' && shopifyDomain && shopifyAccessToken) {
      setLoadingProducts(true);
      fetch('/api/shopify/products.json?limit=50&fields=id,title,handle', {
        headers: {
          'x-shopify-domain': shopifyDomain,
          'x-shopify-access-token': shopifyAccessToken
        }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Error al obtener productos de Shopify');
      })
      .then(data => {
        setShopifyProducts(data.products || []);
      })
      .catch(err => console.error('[Shopify Products Load] Error:', err))
      .finally(() => setLoadingProducts(false));
    } else {
      setShopifyProducts([]);
    }
  }, [ecommercePlatform, shopifyDomain, shopifyAccessToken, refreshKey]);

  // Reply handler
  const handleInboxReply = async (e: React.FormEvent, item: any) => {
    e.preventDefault();
    const replyText = inboxReplies[item.id]?.trim();
    if (!replyText) return;

    setSubmittingInboxReply(prev => ({ ...prev, [item.id]: true }));
    setInboxReplyErrors(prev => ({ ...prev, [item.id]: null }));

    try {
      if (item.type === 'ig_dm' || item.type === 'fb_dm') {
        await metaAds.replyToConversation(item.id, replyText);
      } else if (item.type === 'ig_comment') {
        await metaAds.replyToInstagramComment(item.id, replyText);
      } else if (item.type === 'fb_comment' || item.type === 'ad_comment') {
        await metaAds.replyToFacebookComment(item.id, replyText);
      }

      // Resolve and remove item from list
      setPendingItems(prev => prev.filter(p => p.id !== item.id));
      setInboxReplies(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });

      // If resolved item is currently selected in slide-over, close it
      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      console.error('Error replying from inbox:', err);
      setInboxReplyErrors(prev => ({
        ...prev,
        [item.id]: 'No se pudo enviar la respuesta. Puede que el token no tenga permisos de escritura o haya expirado. Intentá responder directamente en la plataforma.',
      }));
    } finally {
      setSubmittingInboxReply(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Helper to determine if a comment thread is unanswered/pending
  const isCommentPending = (comment: any) => {
    const isFromPage = comment.username === igUsername || comment.from?.id === fbPageId;
    if (isFromPage) return false;
    
    const repliesList = comment.replies?.data || [];
    if (repliesList.length === 0) return true;
    
    const sortedReplies = [...repliesList].sort(
      (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
    );
    const latestReply = sortedReplies[sortedReplies.length - 1];
    const lastIsFromPage = latestReply.username === igUsername || latestReply.from?.id === fbPageId;
    return !lastIsFromPage;
  };

  // AI draft generator
  const generateAiDraft = async (item: any, allPostComments?: any[]) => {
    setLoadingDraft(prev => ({ ...prev, [item.id]: true }));
    setInboxReplyErrors(prev => ({ ...prev, [item.id]: null }));
    try {
      const otherCommentsList = allPostComments
        ? allPostComments
            .filter(c => c.id !== item.id)
            .map(c => `@${c.username || c.from?.name}: ${c.text || c.message || ''}`)
        : [];

      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          itemText: item.text || item.message || '',
          username: item.username || item.from?.name || '',
          postCaption: selectedItem?.postCaption || '',
          otherComments: otherCommentsList,
        }),
      });
      if (!res.ok) throw new Error(`Draft reply error: ${res.status}`);
      const data = await res.json();
      if (data.draft) {
        setInboxReplies(prev => ({ ...prev, [item.id]: data.draft }));
      } else {
        throw new Error('El borrador generado está vacío.');
      }
    } catch (err: any) {
      console.error('Failed to generate AI draft:', err);
      setInboxReplyErrors(prev => ({
        ...prev,
        [item.id]: 'No se pudo generar el borrador con IA. Reintentá o respondé manualmente.',
      }));
    } finally {
      setLoadingDraft(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Bulk draft generation for all pending comments in the slide-over
  const handleBulkDrafts = async (postComments: any[]) => {
    const pendingComments = postComments.filter(c => isCommentPending(c));
    if (pendingComments.length === 0) return;
    
    setBulkDraftsLoading(true);
    
    const promises = pendingComments.map(async (comment) => {
      setLoadingDraft(prev => ({ ...prev, [comment.id]: true }));
      try {
        const usernameStr = comment.username || comment.from?.name || 'usuario';
        const itemTextStr = comment.text || comment.message || '';
        
        // Collect other comments in this post for context
        const otherCommentsList = postComments
          .filter(c => c.id !== comment.id)
          .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

        const res = await fetch('/api/draft-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            itemText: itemTextStr,
            username: usernameStr,
            postCaption: selectedItem?.postCaption || '',
            otherComments: otherCommentsList,
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.draft) {
            setInboxReplies(prev => ({ ...prev, [comment.id]: data.draft }));
          }
        }
      } catch (err) {
        console.error(`Error generating bulk draft for comment ${comment.id}:`, err);
      } finally {
        setLoadingDraft(prev => ({ ...prev, [comment.id]: false }));
      }
    });
    
    await Promise.all(promises);
    setBulkDraftsLoading(false);
  };

  // Toggle liking a comment
  const handleLikeComment = async (commentId: string) => {
    if (likingCommentIds[commentId]) return;
    setLikingCommentIds(prev => ({ ...prev, [commentId]: true }));
    
    const isCurrentlyLiked = !!likedCommentIds[commentId];
    try {
      const platform = selectedItem?.platform || 'instagram';
      if (isCurrentlyLiked) {
        await metaAds.unlikeComment(commentId, platform, igId);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: false }));
        if (selectedItem?.comments) {
          selectedItem.comments = selectedItem.comments.map((c: any) => 
            c.id === commentId ? { ...c, like_count: Math.max(0, (c.like_count || 0) - 1) } : c
          );
        }
      } else {
        await metaAds.likeComment(commentId, platform, igId);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: true }));
        if (selectedItem?.comments) {
          selectedItem.comments = selectedItem.comments.map((c: any) => 
            c.id === commentId ? { ...c, like_count: (c.like_count || 0) + 1 } : c
          );
        }
      }
    } catch (err) {
      console.error('Error toggling comment like:', err);
    } finally {
      setLikingCommentIds(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Submit response for a specific comment inside slide-over
  const handleCommentReplySubmit = async (e: React.FormEvent, commentId: string, commentPlatform: 'instagram' | 'facebook') => {
    e.preventDefault();
    const replyText = inboxReplies[commentId]?.trim();
    if (!replyText) return;

    setSubmittingInboxReply(prev => ({ ...prev, [commentId]: true }));
    setInboxReplyErrors(prev => ({ ...prev, [commentId]: null }));

    try {
      if (commentPlatform === 'instagram') {
        await metaAds.replyToInstagramComment(commentId, replyText);
      } else {
        await metaAds.replyToFacebookComment(commentId, replyText);
      }

      // Add reply locally to the UI
      if (selectedItem?.comments) {
        selectedItem.comments = selectedItem.comments.map((c: any) => {
          if (c.id === commentId) {
            const existingReplies = c.replies?.data || [];
            const newReply = {
              id: `local_${Date.now()}`,
              username: igUsername || 'Página',
              text: replyText,
              timestamp: new Date().toISOString(),
              from: { id: fbPageId, name: 'Página' }
            };
            return {
              ...c,
              replies: {
                data: [...existingReplies, newReply]
              }
            };
          }
          return c;
        });
      }

      // Clean up reply text
      setInboxReplies(prev => {
        const copy = { ...prev };
        delete copy[commentId];
        return copy;
      });

      // Close the reply input
      setActiveReplyCommentIds(prev => ({ ...prev, [commentId]: false }));

      // Recalculate pending comments and counts in pendingItems
      setPendingItems(prevItems => 
        prevItems.map(item => {
          if (item.id === selectedItem.id) {
            const updatedComments = item.comments.map((c: any) => {
              if (c.id === commentId) {
                const existingReplies = c.replies?.data || [];
                const newReply = {
                  id: `local_${Date.now()}`,
                  username: igUsername || 'Página',
                  text: replyText,
                  timestamp: new Date().toISOString(),
                  from: { id: fbPageId, name: 'Página' }
                };
                return {
                  ...c,
                  replies: {
                    data: [...existingReplies, newReply]
                  }
                };
              }
              return c;
            });
            const updatedPending = updatedComments.filter(isCommentPending);
            return {
              ...item,
              comments: updatedComments,
              pendingCount: updatedPending.length,
              isPending: updatedPending.length > 0,
            };
          }
          return item;
        })
      );

    } catch (err: any) {
      console.error('Error replying to comment:', err);
      setInboxReplyErrors(prev => ({
        ...prev,
        [commentId]: 'No se pudo enviar la respuesta. Puede que el token no tenga permisos de escritura o haya expirado.',
      }));
    } finally {
      setSubmittingInboxReply(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Copy Shopify link helper
  const handleCopyLink = (handle: string, prodId: string) => {
    if (!shopifyDomain) return;
    const cleanDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanDomain}/products/${handle}`;
    navigator.clipboard.writeText(url);
    setCopiedProductId(prodId);
    setTimeout(() => setCopiedProductId(null), 2000);
  };

  // Insert Shopify link directly into input
  const handleInsertLink = (handle: string, itemId: string) => {
    if (!shopifyDomain) return;
    const cleanDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanDomain}/products/${handle}`;
    const currentVal = inboxReplies[itemId] || '';
    setInboxReplies(prev => ({
      ...prev,
      [itemId]: currentVal ? `${currentVal} ${url}` : url
    }));
  };

  // Fetch all pending DMs, Comments, and Ads comments
  useEffect(() => {
    if (!clientId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const promises: Promise<any>[] = [];
        
        let igMediaPromise = Promise.resolve<any[]>([]);
        let fbMediaPromise = Promise.resolve<any[]>([]);
        let fbDMsPromise = Promise.resolve<any>(null);
        let igDMsPromise = Promise.resolve<any>(null);
        let adsPromise = Promise.resolve<any>(null);

        // Instagram Feed (for organic comments)
        if (igId) {
          igMediaPromise = metaAds.getInstagramMedia(igId, 24).catch(err => {
            console.error('Error fetching Instagram Media for inbox:', err);
            return [];
          });
        }

        // Facebook Feed & DMs
        if (fbPageId) {
          fbMediaPromise = metaAds.getFacebookPageFeed(fbPageId, 24).catch(err => {
            console.error('Error fetching Facebook Page Feed for inbox:', err);
            return [];
          });
          fbDMsPromise = metaAds.getPageConversations(fbPageId, 'messenger').catch(err => {
            console.error('Error fetching Facebook DMs:', err);
            return null;
          });
          igDMsPromise = metaAds.getPageConversations(fbPageId, 'instagram').catch(err => {
            console.error('Error fetching Instagram DMs via Page:', err);
            return null;
          });
        }

        // Ads (for ads comments)
        if (metaAccountId) {
          adsPromise = metaAds.getAccountAds(metaAccountId).catch(err => {
            console.error('Error fetching Account Ads:', err);
            return null;
          });
        }

        const [
          igMediaRes,
          fbMediaRes,
          fbDMsRes,
          igDMsRes,
          adsRes
        ] = await Promise.all([
          igMediaPromise,
          fbMediaPromise,
          fbDMsPromise,
          igDMsPromise,
          adsPromise
        ]);

        if (!active) return;

        const resolvedIgMedia = (igMediaRes as any)?.data || igMediaRes || [];
        const resolvedFbMedia = (fbMediaRes as any)?.data || fbMediaRes || [];
        const inboxItems: any[] = [];

        // 1. Instagram Direct Messages
        if (igDMsRes?.data) {
          igDMsRes.data.forEach((conv: any) => {
            const lastMsg = conv.messages?.data?.[0];
            const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
            inboxItems.push({
              id: conv.id,
              type: 'ig_dm',
              platform: 'instagram',
              username: participant?.name || lastMsg?.from?.username || 'Usuario de Instagram',
              text: lastMsg?.message || '(Mensaje de voz o archivo de imagen)',
              timestamp: lastMsg?.created_time || conv.updated_time,
              rawItem: conv,
              isPending: conv.unread_count > 0,
            });
          });
        }

        // 2. Facebook Messenger Messages
        if (fbDMsRes?.data) {
          fbDMsRes.data.forEach((conv: any) => {
            const lastMsg = conv.messages?.data?.[0];
            const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
            inboxItems.push({
              id: conv.id,
              type: 'fb_dm',
              platform: 'facebook',
              username: participant?.name || lastMsg?.from?.name || 'Usuario de Messenger',
              text: lastMsg?.message || '(Mensaje de voz o archivo de imagen)',
              timestamp: lastMsg?.created_time || conv.updated_time,
              rawItem: conv,
              isPending: conv.unread_count > 0,
            });
          });
        }

        // 3. Instagram Comments (grouped by post)
        resolvedIgMedia.forEach((post: any) => {
          const commentsList = post.comments?.data || [];
          const userComments = commentsList.filter((comment: any) => comment.username !== igUsername);
          if (userComments.length > 0) {
            const pendingList = userComments.filter((comment: any) => {
              const repliesList = comment.replies?.data || [];
              if (repliesList.length === 0) return true;
              const sortedReplies = [...repliesList].sort(
                (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
              );
              const latestReply = sortedReplies[sortedReplies.length - 1];
              const lastIsFromPage = latestReply.username === igUsername;
              return !lastIsFromPage;
            });

            let latestTimestamp = post.timestamp || new Date().toISOString();
            userComments.forEach((c: any) => {
              const cTime = new Date(c.timestamp).getTime();
              if (cTime > new Date(latestTimestamp).getTime()) {
                latestTimestamp = c.timestamp;
              }
              const repliesList = c.replies?.data || [];
              repliesList.forEach((r: any) => {
                const rTime = new Date(r.timestamp || r.created_time).getTime();
                if (rTime > new Date(latestTimestamp).getTime()) {
                  latestTimestamp = r.timestamp || r.created_time;
                }
              });
            });

            inboxItems.push({
              id: post.id,
              type: 'post_comments',
              platform: 'instagram',
              username: 'Comentarios de Instagram',
              text: post.caption || '(Sin descripción)',
              timestamp: latestTimestamp,
              postCaption: post.caption,
              postThumbnail: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
              permalink: post.permalink,
              comments: userComments,
              pendingCount: pendingList.length,
              totalCount: userComments.length,
              isPending: pendingList.length > 0,
              rawItem: post,
            });
          }
        });

        // 4. Facebook Comments (grouped by post)
        resolvedFbMedia.forEach((post: any) => {
          const commentsList = post.comments?.data || [];
          const userComments = commentsList.filter((comment: any) => comment.from?.id !== fbPageId);
          if (userComments.length > 0) {
            const pendingList = userComments.filter((comment: any) => {
              const repliesList = comment.replies?.data || [];
              if (repliesList.length === 0) return true;
              const sortedReplies = [...repliesList].sort(
                (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
              );
              const latestReply = sortedReplies[sortedReplies.length - 1];
              const lastIsFromPage = latestReply.from?.id === fbPageId || latestReply.username === igUsername;
              return !lastIsFromPage;
            });

            let latestTimestamp = post.created_time || new Date().toISOString();
            userComments.forEach((c: any) => {
              const cTime = new Date(c.created_time).getTime();
              if (cTime > new Date(latestTimestamp).getTime()) {
                latestTimestamp = c.created_time;
              }
              const repliesList = c.replies?.data || [];
              repliesList.forEach((r: any) => {
                const rTime = new Date(r.timestamp || r.created_time).getTime();
                if (rTime > new Date(latestTimestamp).getTime()) {
                  latestTimestamp = r.timestamp || r.created_time;
                }
              });
            });

            inboxItems.push({
              id: post.id,
              type: 'post_comments',
              platform: 'facebook',
              username: 'Comentarios de Facebook',
              text: post.message || '(Sin descripción)',
              timestamp: latestTimestamp,
              postCaption: post.message,
              postThumbnail: post.full_picture,
              permalink: post.permalink_url,
              comments: userComments,
              pendingCount: pendingList.length,
              totalCount: userComments.length,
              isPending: pendingList.length > 0,
              rawItem: post,
            });
          }
        });

        // 5. Meta Ads Comments (grouped by story)
        if (adsRes?.data) {
          const activeAds = adsRes.data.filter((ad: any) => ad.status === 'ACTIVE' && ad.creative?.effective_object_story_id);
          const activeStoryIds = Array.from(new Set(activeAds.map((ad: any) => ad.creative.effective_object_story_id))) as string[];
          
          if (activeStoryIds.length > 0) {
            const adCommentsPromises = activeStoryIds.map(async (storyId) => {
              try {
                const res = await metaAds.getAdCreativeComments(storyId);
                const adForStory = activeAds.find((ad: any) => ad.creative.effective_object_story_id === storyId);
                return {
                  storyId,
                  adName: adForStory?.name || 'Anuncio',
                  comments: res?.data || [],
                  adPermalink: adForStory?.creative?.instagram_permalink_url || adForStory?.preview_shareable_link
                };
              } catch (err) {
                console.error(`Error fetching comments for story ID ${storyId}:`, err);
                return { storyId, adName: 'Anuncio', comments: [], adPermalink: null };
              }
            });

            const adCommentsResults = await Promise.all(adCommentsPromises);
            
            adCommentsResults.forEach((result) => {
              const commentsList = result.comments || [];
              const userComments = commentsList.filter((comment: any) => comment.from?.id !== fbPageId && comment.username !== igUsername);
              if (userComments.length > 0) {
                const pendingList = userComments.filter((comment: any) => {
                  const repliesList = comment.replies?.data || [];
                  if (repliesList.length === 0) return true;
                  const sortedReplies = [...repliesList].sort(
                    (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
                  );
                  const latestReply = sortedReplies[sortedReplies.length - 1];
                  const lastIsFromPage = latestReply.from?.id === fbPageId || latestReply.username === igUsername;
                  return !lastIsFromPage;
                });

                let latestTimestamp = new Date().toISOString();
                let hasTime = false;
                userComments.forEach((c: any) => {
                  const timestampStr = c.timestamp || c.created_time;
                  if (timestampStr) {
                    const cTime = new Date(timestampStr).getTime();
                    if (!hasTime || cTime > new Date(latestTimestamp).getTime()) {
                      latestTimestamp = timestampStr;
                      hasTime = true;
                    }
                  }
                  const repliesList = c.replies?.data || [];
                  repliesList.forEach((r: any) => {
                    const rTimestampStr = r.timestamp || r.created_time;
                    if (rTimestampStr) {
                      const rTime = new Date(rTimestampStr).getTime();
                      if (!hasTime || rTime > new Date(latestTimestamp).getTime()) {
                        latestTimestamp = rTimestampStr;
                        hasTime = true;
                      }
                    }
                  });
                });

                inboxItems.push({
                  id: result.storyId,
                  type: 'post_comments',
                  platform: userComments[0]?.username ? 'instagram' : 'facebook',
                  username: `Comentarios de Anuncio: ${result.adName}`,
                  text: `Anuncio: ${result.adName}`,
                  timestamp: latestTimestamp,
                  postCaption: `Anuncio: ${result.adName}`,
                  postThumbnail: null,
                  permalink: result.adPermalink,
                  comments: userComments,
                  pendingCount: pendingList.length,
                  totalCount: userComments.length,
                  isPending: pendingList.length > 0,
                  rawItem: result,
                });
              }
            });
          }
        }

        // Sort items by date descending
        inboxItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setPendingItems(inboxItems);

      } catch (err: any) {
        console.error('Failed to load messaging data:', err);
        setError(err.message || 'Error al obtener los pendientes.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [clientId, igId, fbPageId, metaAccountId, refreshKey]);

  // Mode-based items selection ('pending' vs 'all')
  const currentSectionItems = useMemo(() => {
    if (inboxSection === 'messages') {
      return pendingItems.filter(item => ['ig_dm', 'fb_dm'].includes(item.type));
    }
    return pendingItems.filter(item => item.type === 'post_comments');
  }, [pendingItems, inboxSection]);

  // Secondary filter by pending vs all
  const filteredPendingItems = useMemo(() => {
    if (inboxMode === 'pending') {
      return currentSectionItems.filter(item => item.isPending);
    }
    return currentSectionItems;
  }, [currentSectionItems, inboxMode]);

  // Counts for Badges
  const pendingMessagesCount = useMemo(() => {
    return pendingItems.filter(item => item.isPending && ['ig_dm', 'fb_dm'].includes(item.type)).length;
  }, [pendingItems]);

  const pendingCommentsCount = useMemo(() => {
    return pendingItems.filter(item => item.isPending && item.type === 'post_comments').length;
  }, [pendingItems]);

  const allMessagesCount = useMemo(() => {
    return pendingItems.filter(item => ['ig_dm', 'fb_dm'].includes(item.type)).length;
  }, [pendingItems]);

  const allCommentsCount = useMemo(() => {
    return pendingItems.filter(item => item.type === 'post_comments').length;
  }, [pendingItems]);

  // Filtered Shopify products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return shopifyProducts;
    const s = productSearch.toLowerCase();
    return shopifyProducts.filter(p => p.title.toLowerCase().includes(s));
  }, [shopifyProducts, productSearch]);

  return (
    <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-300 relative">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            Mensajería Pendiente
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5 text-violet-500" />
            Bandeja unificada para DMs y comentarios sin responder de Facebook, Instagram y Ads.
          </p>
        </div>

        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-white dark:bg-[#111] border border-zinc-250/60 dark:border-zinc-800/80 rounded-full text-[12.5px] font-bold shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-850 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <EmailLoader 
            loading={loading} 
            color="#8b5cf6" 
            labels={['Cargando DMs de Instagram y Facebook...', 'Buscando comentarios orgánicos...', 'Consultando comentarios en Meta Ads...']} 
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="h-44 bg-white dark:bg-[#111] border border-zinc-200/50 dark:border-white/[0.04] rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al obtener datos</h3>
            <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{error}</p>
          </div>
        </div>
      ) : !igId && !fbPageId ? (
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <Inbox className="w-12 h-12 text-zinc-400 mx-auto" />
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Bandeja no disponible</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Este cliente no tiene vinculadas cuentas de Instagram o Facebook Page. Habilitalas desde la Gestión de Clientes.
          </p>
        </div>
       ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Primary Tab Switcher: Mensajería Directa (DMs) vs Comentarios de Publicaciones */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
            <button
              onClick={() => setInboxSection('messages')}
              className={`pb-3 text-[14px] font-black tracking-tight transition-all relative flex items-center gap-1.5 focus:outline-none ${
                inboxSection === 'messages'
                  ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 dark:border-violet-400 font-extrabold'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border-b-2 border-transparent'
              }`}
            >
              📥 Mensajería Directa (DMs)
              {pendingMessagesCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                  {pendingMessagesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setInboxSection('comments')}
              className={`pb-3 text-[14px] font-black tracking-tight transition-all relative flex items-center gap-1.5 focus:outline-none ${
                inboxSection === 'comments'
                  ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 dark:border-violet-400 font-extrabold'
                  : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300 border-b-2 border-transparent'
              }`}
            >
              💬 Comentarios de Publicaciones
              {pendingCommentsCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                  {pendingCommentsCount}
                </span>
              )}
            </button>
          </div>

          {/* Inbox Summary Info Banner */}
          <div className="flex items-center justify-between p-4 bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100/50 dark:border-violet-900/20 rounded-2xl">
            <div className="flex items-center gap-2 text-violet-750 dark:text-violet-400">
              <Info className="w-4 h-4 flex-shrink-0" />
              <p className="text-[12.5px] font-semibold">
                Bandeja inteligente. Hacé click en cualquier tarjeta para profundizar en el historial completo de la conversación, buscar productos en Shopify y responder con IA.
              </p>
            </div>
            {!fbPageId && (
              <span className="bg-amber-100 text-amber-800 dark:bg-amber-955/40 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0">
                Facebook sin conectar
              </span>
            )}
          </div>

          {/* Inbox Sub-Filters */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1 bg-zinc-150/80 dark:bg-zinc-800/60 border border-zinc-200/40 dark:border-zinc-700/65 p-0.5 rounded-xl">
              <button
                onClick={() => setInboxMode('pending')}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all ${
                  inboxMode === 'pending'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm font-black'
                    : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
                }`}
              >
                Solo Pendientes ({inboxSection === 'messages' ? pendingMessagesCount : pendingCommentsCount})
              </button>
              <button
                onClick={() => setInboxMode('all')}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all ${
                  inboxMode === 'all'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm font-black'
                    : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-205'
                }`}
              >
                Mostrar Todos ({inboxSection === 'messages' ? allMessagesCount : allCommentsCount})
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[12px] text-zinc-405 font-bold">
                {inboxMode === 'pending' 
                  ? `Mostrando ${filteredPendingItems.length} pendientes` 
                  : `Mostrando ${filteredPendingItems.length} totales`
                }
              </p>
              
              {/* Density Toggle */}
              <div className="flex items-center gap-1 bg-zinc-150/80 dark:bg-zinc-800/60 border border-zinc-200/40 dark:border-zinc-700/65 p-0.5 rounded-lg">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-black transition-all ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm font-black'
                      : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
                  }`}
                >
                  Lista
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-black transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
                  }`}
                >
                  Cuadrícula
                </button>
              </div>
            </div>
          </div>

          {/* Grid or List layout of pending items */}
          {filteredPendingItems.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/65 dark:border-zinc-800/65 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mx-auto text-green-500">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">
                {inboxMode === 'pending' ? '¡Bandeja vacía!' : 'No hay mensajes'}
              </h3>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                {inboxMode === 'pending' 
                  ? 'Buen trabajo. No tenés mensajes o comentarios pendientes en esta categoría.'
                  : 'No se encontraron mensajes o comentarios en esta categoría.'
                }
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 animate-in fade-in duration-200">
              {filteredPendingItems.map((item: any) => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedItem(item)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4 shadow-sm space-y-3 hover:shadow-md hover:border-zinc-350 dark:hover:border-zinc-700 hover:scale-[1.01] active:scale-[0.99] cursor-pointer transition-all duration-200 flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-150/40 dark:border-zinc-850/40 pb-2">
                      <div className="flex items-center gap-2">
                        {item.platform === 'instagram' ? (
                          <div className="w-7 h-7 bg-pink-50 dark:bg-pink-950/20 rounded-full flex items-center justify-center text-pink-500">
                            <Instagram className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500">
                            <span className="font-black text-xs">f</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-200 block leading-tight">
                            {item.type === 'ig_dm' && 'Mensaje (Direct)'}
                            {item.type === 'fb_dm' && 'Mensaje (Messenger)'}
                            {item.type === 'post_comments' && item.platform === 'instagram' && 'Comentarios IG'}
                            {item.type === 'post_comments' && item.platform === 'facebook' && 'Comentarios FB'}
                            {item.type === 'post_comments' && !['instagram','facebook'].includes(item.platform) && 'Comentarios'}
                          </span>
                          <span className="text-[9.5px] text-zinc-400 font-bold block mt-0.5">
                            {new Date(item.timestamp).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {inboxMode === 'all' && (
                          <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                            item.isPending
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-955/20 dark:text-amber-400'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-955/20 dark:text-emerald-400'
                          }`}>
                            {item.isPending ? 'Pendiente' : 'Respondido'}
                          </span>
                        )}
                        
                        {(item.postThumbnail) && (
                          <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-850 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                            {item.postThumbnail ? (
                              <img src={item.postThumbnail} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-violet-500">
                                <Layers className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* User and message */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12.5px] font-bold text-zinc-900 dark:text-white group-hover:text-violet-500 transition-colors">
                          @{item.username}
                        </span>
                        {item.type === 'ad_comment' && (
                          <span className="bg-violet-50 text-violet-600 dark:bg-violet-950/20 dark:text-violet-400 text-[8.5px] font-bold px-1.5 py-0.5 rounded max-w-[120px] truncate">
                            {item.adName || 'Anuncio'}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-normal font-semibold italic bg-zinc-50 dark:bg-zinc-950/30 p-2.5 rounded-xl border border-zinc-100/60 dark:border-zinc-850/50 line-clamp-3">
                        "{item.text}"
                      </p>
                    </div>
                  </div>

                  {/* Actions preview bottom */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-850/40 mt-3 flex items-center justify-between text-[11px] font-bold text-violet-600 dark:text-violet-400">
                    <span>Responder en pantalla completa →</span>
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        title="Ver en red social"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* High density list view */
            <div className="border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-150 dark:divide-zinc-850 shadow-sm animate-in fade-in duration-200">
              {filteredPendingItems.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-zinc-50/60 dark:hover:bg-zinc-850/45 cursor-pointer transition-colors group text-[12.5px]"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Platform Icon */}
                    {item.platform === 'instagram' ? (
                      <Instagram className="w-4 h-4 text-pink-505 flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 text-blue-500 font-black text-xs text-center flex-shrink-0">f</span>
                    )}

                    {/* Username */}
                    <span className="font-bold text-zinc-850 dark:text-zinc-200 flex-shrink-0">
                      @{item.username}
                    </span>

                    {/* Tags (Type, Campaign name if Ads) */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
                        {item.type === 'ig_dm' && 'DM'}
                        {item.type === 'fb_dm' && 'Messenger'}
                        {item.type === 'ig_comment' && 'Comentario'}
                        {item.type === 'fb_comment' && 'Comentario'}
                        {item.type === 'ad_comment' && 'Comentario Ad'}
                      </span>
                      {item.type === 'ad_comment' && item.adName && (
                        <span className="bg-violet-50 text-violet-650 dark:bg-violet-950/20 dark:text-violet-400 text-[9px] font-bold px-1.5 py-0.5 rounded max-w-[100px] truncate">
                          {item.adName}
                        </span>
                      )}
                      
                      {/* Status Badge in List View */}
                      {inboxMode === 'all' && (
                        <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${
                          item.isPending
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-955/20 dark:text-amber-400'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-955/20 dark:text-emerald-400'
                        }`}>
                          {item.isPending ? 'Pendiente' : 'Respondido'}
                        </span>
                      )}
                    </div>

                    {/* Message content snippet */}
                    <p className="text-zinc-500 dark:text-zinc-450 truncate italic font-semibold flex-1">
                      "{item.text}"
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Timestamp */}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold">
                      {new Date(item.timestamp).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                {/* Hover indicator */}
                    <span className="text-violet-650 dark:text-violet-400 font-black opacity-0 group-hover:opacity-100 transition-opacity text-[11px]">
                      Responder →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAILED SLIDE-OVER (Intercom / Apple Siri feel detail sheets) */}
      {selectedItem && (
        <div className="fixed inset-0 z-[400] flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedItem(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />
          
          {/* Slide-over panel container */}
          <div className="relative w-full max-w-4xl h-full bg-white dark:bg-[#0d0d11] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-350 ease-out z-10">
            
            {/* Slide-over Header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/85 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                {selectedItem.platform === 'instagram' ? (
                  <div className="w-8 h-8 bg-pink-50 dark:bg-pink-950/20 rounded-full flex items-center justify-center text-pink-500">
                    <Instagram className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500 font-black text-sm">
                    f
                  </div>
                )}
                <div>
                  <h3 className="font-black text-zinc-900 dark:text-white text-[15px] leading-tight">
                    Conversación con @{selectedItem.username}
                  </h3>
                  <span className="text-[10px] text-zinc-400 font-bold block mt-0.5 uppercase tracking-wide">
                    {selectedItem.type.replace('_', ' ')} · Recibido el {new Date(selectedItem.timestamp).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedItem.permalink && (
                  <a 
                    href={selectedItem.permalink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-1 px-3 py-1 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 rounded-xl text-[11px] text-violet-650 dark:text-violet-400 font-bold transition-all border border-violet-100/50 dark:border-violet-900/20"
                  >
                    Ver original
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Slide-over Body (Split in 2 Columns: Chat / Shopify Products) */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5 h-full">
              
              {/* Column 1: Thread History & Reply box (60%) */}
              <div className="md:col-span-3 flex flex-col justify-between border-r border-zinc-100 dark:border-zinc-800 h-full overflow-hidden bg-zinc-50/20 dark:bg-zinc-950/10">
                
                {/* Scrollable Conversation flow */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {/* Context Card (if it's a comment) */}
                  {(selectedItem.postCaption || selectedItem.postMessage) && (
                    <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl flex flex-col gap-3 shadow-sm">
                      <div className="flex gap-3">
                        {selectedItem.postThumbnail && (
                          <div className="w-14 h-14 bg-zinc-100 rounded-lg overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-800">
                            <img src={selectedItem.postThumbnail} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black text-zinc-405 uppercase tracking-widest block mb-0.5">Publicación de Contexto</span>
                          <p className="text-[12px] text-zinc-650 dark:text-zinc-400 font-semibold line-clamp-2 leading-relaxed">
                            {selectedItem.postCaption || selectedItem.postMessage}
                          </p>
                        </div>
                      </div>

                      {/* Interactive Media Player (for Videos/Images/Carousels) */}
                      {selectedItem.postMediaUrl && (
                        <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-3 mt-1">
                          {selectedItem.postMediaType === 'VIDEO' ? (
                            <div className="rounded-xl overflow-hidden bg-black max-w-[280px] border border-zinc-200 dark:border-zinc-800 mx-auto shadow-sm">
                              <video
                                src={selectedItem.postMediaUrl}
                                poster={selectedItem.postThumbnailUrl || selectedItem.postThumbnail}
                                controls
                                className="w-full max-h-64 object-contain"
                              />
                            </div>
                          ) : (
                            <div className="rounded-xl overflow-hidden max-w-[280px] border border-zinc-200 dark:border-zinc-800 mx-auto shadow-sm">
                              <img
                                src={selectedItem.postMediaUrl}
                                alt="Post Media"
                                className="w-full max-h-64 object-cover"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Messages Flow bubbles */}
                  <div className="space-y-3 pt-2">
                    {/* If Direct Messages */}
                    {(selectedItem.type === 'ig_dm' || selectedItem.type === 'fb_dm') ? (
                      selectedItem.rawItem.messages?.data ? (
                        [...selectedItem.rawItem.messages.data].reverse().map((msg: any) => {
                          const isMe = msg.from?.id === fbPageId;
                          return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <span className="text-[9px] text-zinc-400 font-bold mb-0.5 px-2">
                                {isMe ? 'Yo' : `@${selectedItem.username}`} · {new Date(msg.created_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div className={`max-w-[85%] rounded-[18px] px-4 py-2.5 text-[12.5px] leading-relaxed font-semibold ${
                                isMe 
                                  ? 'bg-violet-600 text-white shadow-sm' 
                                  : 'bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 shadow-sm'
                              }`}>
                                {msg.message}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800 text-center font-semibold text-zinc-700 dark:text-zinc-300">
                          {selectedItem.text}
                        </div>
                      )
                    ) : (
                      // If comment
                      <div className="space-y-4">
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] text-zinc-400 font-bold mb-0.5 px-2">
                            @{selectedItem.username} · {new Date(selectedItem.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div className="max-w-[90%] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-[18px] p-4 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100 shadow-sm leading-relaxed italic">
                            "{selectedItem.text}"
                          </div>
                        </div>

                        {/* Nested Replies (already made from page/brand) */}
                        {selectedItem.rawItem.replies?.data?.map((reply: any) => {
                          const replyUser = reply.username || reply.from?.name || 'Yo';
                          const isPage = replyUser === igUsername || reply.from?.id === fbPageId;
                          return (
                            <div key={reply.id} className={`flex flex-col ${isPage ? 'items-end' : 'items-start'} pl-6`}>
                              <span className="text-[9px] text-zinc-400 font-bold mb-0.5 px-2">
                                {replyUser} · {new Date(reply.timestamp || reply.created_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div className={`max-w-[85%] rounded-[16px] px-3.5 py-2.5 text-[12.5px] leading-relaxed font-semibold ${
                                isPage 
                                  ? 'bg-violet-600 text-white shadow-sm' 
                                  : 'bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-sm'
                              }`}>
                                {reply.text || reply.message}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply controls and input */}
                <div className="p-4 border-t border-zinc-150 dark:border-zinc-850 bg-white dark:bg-zinc-900 space-y-3">
                  {inboxReplyErrors[selectedItem.id] && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-[11px] text-amber-700 dark:text-amber-400 font-semibold flex items-start gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span>{inboxReplyErrors[selectedItem.id]}</span>
                    </div>
                  )}

                  <form onSubmit={(e) => handleInboxReply(e, selectedItem)} className="space-y-3">
                    <textarea
                      placeholder={`Escribí una respuesta para @${selectedItem.username}...`}
                      value={inboxReplies[selectedItem.id] || ''}
                      onChange={(e) => setInboxReplies(prev => ({ ...prev, [selectedItem.id]: e.target.value }))}
                      disabled={submittingInboxReply[selectedItem.id] || loadingDraft[selectedItem.id]}
                      rows={3}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-2xl px-4 py-3 text-[13px] text-zinc-850 dark:text-zinc-100 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-950 focus:border-violet-500 outline-none transition-all shadow-inner font-medium resize-none leading-relaxed"
                    />
                    
                    <div className="flex items-center justify-between gap-3">
                      {/* AI Sparkles suggestion button */}
                      <button
                        type="button"
                        onClick={() => generateAiDraft(selectedItem)}
                        disabled={submittingInboxReply[selectedItem.id] || loadingDraft[selectedItem.id]}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/25 dark:hover:bg-violet-900/40 text-violet-650 dark:text-violet-400 rounded-xl text-[12px] font-black border border-violet-100/50 dark:border-violet-900/25 transition-all shadow-sm cursor-pointer"
                      >
                        {loadingDraft[selectedItem.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Borrador con IA (Algor)
                      </button>

                      <button
                        type="submit"
                        disabled={submittingInboxReply[selectedItem.id] || loadingDraft[selectedItem.id] || !(inboxReplies[selectedItem.id] || '').trim()}
                        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[12.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-violet-600/10 cursor-pointer"
                      >
                        {submittingInboxReply[selectedItem.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        Resolver y Enviar
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Column 2: Context panel & Shopify products (40%) */}
              <div className="md:col-span-2 p-6 overflow-y-auto space-y-6 h-full bg-white dark:bg-[#0d0d11]">
                
                {/* Client info summary */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Información del Cliente</h4>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl space-y-2 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-bold">Usuario:</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-150">@{selectedItem.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-bold">Red:</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-150 capitalize">{selectedItem.platform}</span>
                    </div>
                    {selectedItem.adName && (
                      <div className="flex flex-col pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/80">
                        <span className="text-zinc-400 font-bold">Campaña de Anuncio:</span>
                        <span className="font-black text-violet-600 dark:text-violet-400 mt-0.5">{selectedItem.adName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Shopify products finder block */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Catálogo Shopify</h4>
                    {loadingProducts && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
                  </div>

                  {!shopifyDomain ? (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl text-center text-[12px] text-zinc-400 font-semibold italic">
                      Tienda Shopify no vinculada en Gestión de Clientes.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Search box */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Buscar producto en la tienda..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl pl-8 pr-3 py-1.5 text-[11.5px] focus:bg-white focus:border-violet-500 outline-none transition-all shadow-inner font-medium text-zinc-800 dark:text-zinc-100"
                        />
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Products List */}
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {filteredProducts.length === 0 ? (
                          <p className="text-[11px] text-zinc-450 italic text-center py-4">No se encontraron productos.</p>
                        ) : (
                          filteredProducts.map(p => (
                            <div 
                              key={p.id} 
                              className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl flex items-center justify-between gap-3 text-[12px] hover:border-zinc-350 dark:hover:border-zinc-700 transition-all"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-zinc-800 dark:text-zinc-200 block truncate" title={p.title}>
                                  {p.title}
                                </span>
                                <span className="text-[9.5px] text-zinc-400 block font-mono truncate">
                                  /{p.handle}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(p.handle, p.id)}
                                  className={`p-1.5 border rounded-lg transition-all ${
                                    copiedProductId === p.id 
                                      ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-950/20 dark:border-green-900/35' 
                                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-750 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100'
                                  }`}
                                  title="Copiar link de compra"
                                >
                                  {copiedProductId === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsertLink(p.handle, selectedItem.id)}
                                  className="p-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 text-violet-600 dark:text-violet-400 border border-violet-100/50 dark:border-violet-900/20 rounded-lg transition-all"
                                  title="Insertar link en borrador"
                                >
                                  <Link className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
