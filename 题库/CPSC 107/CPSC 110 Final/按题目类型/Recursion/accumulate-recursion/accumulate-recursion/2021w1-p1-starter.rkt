;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag

;;
;; PROBLEM:
;;
;; Below is the same data definition for binary trees that you have seen in
;; lecture (including most of the example data, with a change to some node keys
;; in BT5).
;;
;; Recall that a binary search tree is a binary tree in which two invariants
;; hold. Specifically, for all nodes in the tree
;;  - the node's key is larger than every key in its left branch
;;  - the node's key is smaller than every key in its right branch
;;
;; In lecture we designed a function that used accumulators to check whether
;; a given binary tree satisfies both invariants - in other words whether it
;; is a binary search tree.
;;
;; In this problem we want you to design a similar function (called bst-dist?),
;; that consumes a BinaryTree and a Natural (called distance). This function has
;; one element of additional functionality.  This function should produce true
;; if for all nodes in the tree
;;  - the node's key is larger than every key in its left branch
;;  - the node's key is smaller than every key in its right branch
;;  - the node's key is at least distance away from every other key in the
;;    tree - so it is at least distance > or < every other key in the tree
;;
;; REMEMBER that when you are unsure about a function you need to spend
;; more time on the examples step of the recipe.  So do that here.  Take
;; the paper and draw out some examples and really think about what the
;; function will need to do.  If you work through examples carefully you
;; will probably discover that it's simpler than it initially seems.
;;
;; Here are some examples. You may want to add some more.
;;
;; Example 1: (bst-dist? BT1 5) is true
;;             because it is a valid bst and no two keys are < 5 apart
;;
;; Example 2: (bst-dist? BT1 10) is false
;;             because it is a valid bst, but 30 - 25 = 5 which is < 10 apart
;;
;; Example 3: (bst-dist? BT2 1) is false
;;             because it is not a valid bst
;;
;; Example 4: (bst-dist? BT5 1) is true
;;             because it is a valid bst and no two keys are < 5 apart
;;
;; Example 5: (bst-dist? BT5 2) is false
;;             because it is a valid bst, but 25, 26 and 74, 75 < 2 apart

(@htdd BinaryTree)

(define-struct node (k v l r))
;; BinaryTree is one of:
;;  - false
;;  - (make-node Integer String BinaryTree BinaryTree)
;; interp.
;;   a binary tree where each node has a key, value and two sub-nodes

(define (fn-for-bst t)
  (cond [(false? t) (...)]
        [else
         (... (node-k t)
              (node-v t)
              (fn-for-bst (node-l t))
              (fn-for-bst (node-r t)))]))

(define BT1 (make-node 100 "a"
                       (make-node 50 "b"
                                  (make-node 25 "c"
                                             (make-node 10 "d" false false)
                                             (make-node 30 "e" false false))
                                  (make-node 75 "c"
                                             (make-node 60 "d" false false)
                                             (make-node 80 "e" false false)))
                       (make-node 200 "f" false false)))

(define BT2 (make-node 100 "a"   ;violates left branch rule
                       (make-node 50 "b"
                                  (make-node 51 "c"
                                             (make-node 10 "d" false false)
                                             (make-node 30 "e" false false))
                                  (make-node 75 "c"
                                             (make-node 60 "d" false false)
                                             (make-node 80 "e" false false)))
                       (make-node 200 "f" false false)))

(define BT3 (make-node 100 "a"   ;violates right branch rule
                       (make-node 50 "b"
                                  (make-node 25 "c"
                                             (make-node 10 "d" false false)
                                             (make-node 30 "e" false false))
                                  (make-node 49 "c"
                                             (make-node 60 "d" false false)
                                             (make-node 80 "e" false false)))
                       (make-node 200 "f" false false)))

(define BT4 (make-node 100 "a"
                       (make-node 50 "b"
                                  (make-node 25 "c"
                                             (make-node 10 "d" false false)
                                             (make-node 30 "e" false false))
                                  (make-node 101 "c"
                                             (make-node 60 "d" false false)
                                             (make-node 80 "e" false false)))
                       (make-node 200 "f" false false)))

(define BT5 (make-node 100 "a"
                       (make-node 50 "b"
                                  (make-node 25 "c"
                                             (make-node 10 "d" false false)
                                             (make-node 26 "e" false false))
                                  (make-node 75 "f"
                                             (make-node 74 "g" false false)
                                             (make-node 77 "h" false false)))
                       (make-node 160 "i" false false)))



 
(@htdf bst-dist?)
(@signature BinaryTree Natural -> Boolean)
;; true if BST invariants are satisfied, and no keys are < distance apart
;; !!!
(define (bst-dist? bt distance) false)
