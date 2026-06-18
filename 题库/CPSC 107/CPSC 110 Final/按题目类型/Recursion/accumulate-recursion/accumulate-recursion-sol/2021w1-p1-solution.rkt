;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag

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

(check-expect (bst-dist? false 2) true)
(check-expect (bst-dist? BT1  5) true)
(check-expect (bst-dist? BT1 10) false)
(check-expect (bst-dist? BT2  1) false)
(check-expect (bst-dist? BT3  1) false)
(check-expect (bst-dist? BT5  1) true)
(check-expect (bst-dist? BT5  2) false)

;(define (bst-dist? bt d) false) ; stub

(@template-origin BinaryTree accumulator)

(define (bst-dist? bt d)
  ;; lo, hi are Integer
  ;; current lower and higher inclusive bounds of the node key
  ;; when going left   lo unchanged      hi becomes k - d
  ;; when going right  lo becomes k + d  hi unchanged
  ;; when d is 1 this is like the ordinary bst? predicate
  ;; 
  (local [(define (fn-for-bst t lo hi)
            (cond [(false? t) true]
                  [else
                   (and (<= lo (node-k t) hi)
                        (fn-for-bst (node-l t) lo (- (node-k t) d))
                        (fn-for-bst (node-r t) (+ (node-k t) d) hi))]))]
    (fn-for-bst bt -inf.0 +inf.0)))
